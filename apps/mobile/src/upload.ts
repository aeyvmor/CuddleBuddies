/**
 * Uploader: moves queued captures to the ASTIG API. Pure orchestration with injected
 * dependencies, so every path is tested without a device (src/upload.test.ts).
 *
 * Per capture, oldest first (docs/api/integration-guide.md, "Mobile capture"):
 *   POST /sessions (once per session, idempotent on clientSessionId)
 *   POST /sessions/{id}/observations   the capture record built at capture time
 *   POST /upload-url                   for the exact byte length of the (downscaled) JPEG
 *   PUT  <presigned url>               the JPEG
 * A capture stays PENDING until the PUT succeeds. 409 ALREADY_UPLOADED means it is done.
 * An S3 403 (expired URL) gets one fresh URL. A failure never becomes an upload.
 * Ended sessions are reported with PATCH /sessions/{id}.
 */
import type { AstigClient, UploadBody } from "./api/client.ts";
import { AstigApiError } from "./api/errors.ts";
import type { UploadSessionInfo } from "./persist.ts";
import { pendingUploads, type CapturedEntry, type QueueEntry } from "./queue.ts";

export type UploadClient = Pick<AstigClient, "startSession" | "endSession" | "registerObservation" | "createUploadUrl" | "uploadImage">;

export interface PreparedImage {
  body: UploadBody;
  bytes: number;
  /** Delete any temporary copy. */
  dispose: () => void;
}

export interface UploadDeps {
  client: UploadClient;
  /** Produce the bytes to upload (the phone downscales; tests return fixed bytes). */
  prepareImage: (entry: CapturedEntry) => Promise<PreparedImage>;
  deviceId: string;
  vehicleId: string;
}

/** Captures that may be uploaded: PENDING and from a session listed for upload, oldest first. */
export function uploadablePending(queue: QueueEntry[], sessions: Record<string, UploadSessionInfo>): CapturedEntry[] {
  return pendingUploads(queue).filter((e) => sessions[e.clientSessionId] !== undefined);
}

/** Older local captures (from builds before the uploader) that stay on the phone only. */
export function localOnlyCount(queue: QueueEntry[], sessions: Record<string, UploadSessionInfo>): number {
  return queue.filter((e) => e.kind === "CAPTURED" && sessions[e.clientSessionId] === undefined).length;
}

const isAuthProblem = (e: unknown) => e instanceof AstigApiError && (e.code === "AUTH_REQUIRED" || e.code === "UNAUTHENTICATED");
/** Stops the pass: the next capture would fail the same way (offline, server down, signed out, wrong role). */
const stopsPass = (e: unknown) => !(e instanceof AstigApiError) || e.retryable || isAuthProblem(e) || e.code === "FORBIDDEN";

/** Register the session once. The start location is fixed the first time it is sent, so a retry is identical. */
export async function ensureSession(
  clientSessionId: string,
  info: UploadSessionInfo,
  fallbackLocation: { latitude: number; longitude: number },
  deps: UploadDeps,
): Promise<UploadSessionInfo> {
  if (info.serverId) return info;
  const startLocation = info.startLocation ?? fallbackLocation;
  const res = await deps.client.startSession({ clientSessionId, deviceId: deps.deviceId, vehicleId: deps.vehicleId, startedAt: info.startedAt, startLocation });
  return { ...info, startLocation, serverId: res.session.id };
}

/** Upload one capture. Safe to repeat after any failure: every step is idempotent on the capture's ids. */
export async function uploadCapture(entry: CapturedEntry, serverSessionId: string, deps: UploadDeps): Promise<{ observationId: string; result: "NOW" | "ALREADY" }> {
  const reg = await deps.client.registerObservation(serverSessionId, entry.request);
  const observationId = reg.observation.id;
  const image = await deps.prepareImage(entry);
  try {
    const getUrl = async () => {
      try {
        return await deps.client.createUploadUrl({ observationId, contentType: "image/jpeg", contentLengthBytes: image.bytes });
      } catch (e) {
        if (e instanceof AstigApiError && e.code === "ALREADY_UPLOADED") return null;
        throw e;
      }
    };
    let url = await getUrl();
    if (!url) return { observationId, result: "ALREADY" };
    try {
      await deps.client.uploadImage(url, image.body);
    } catch (e) {
      // An expired or mismatched presigned URL: ask for a fresh one once, never reuse the old one.
      if (!(e instanceof AstigApiError && e.status === 403)) throw e;
      url = await getUrl();
      if (!url) return { observationId, result: "ALREADY" };
      await deps.client.uploadImage(url, image.body);
    }
    return { observationId, result: "NOW" };
  } finally {
    image.dispose();
  }
}

export interface PassCallbacks {
  /** A capture is stored on the server: record it (journal line) before the next one. */
  onUploaded: (entry: CapturedEntry, observationId: string, at: Date) => void;
  /** A session's upload info changed (registered, end reported): persist it. */
  onSession: (clientSessionId: string, info: UploadSessionInfo) => void;
  now: () => Date;
}

export interface PassResult {
  uploaded: number;
  /** Captures that were tried and refused (left PENDING). */
  failed: number;
  /** The error that stopped the pass, or the last refusal. Null when everything went through. */
  error: AstigApiError | Error | null;
  /** True when the error stopped the pass (offline, server, sign-in, role). */
  stopped: boolean;
  authLost: boolean;
}

/** One upload pass over everything waiting, then report ended sessions. */
export async function runUploadPass(queue: QueueEntry[], sessions: Record<string, UploadSessionInfo>, deps: UploadDeps, cb: PassCallbacks): Promise<PassResult> {
  const current = { ...sessions };
  const result: PassResult = { uploaded: 0, failed: 0, error: null, stopped: false, authLost: false };
  const stop = (e: unknown) => {
    result.error = e instanceof Error ? e : new Error(String(e));
    result.stopped = true;
    result.authLost = isAuthProblem(e);
    return result;
  };

  for (const entry of uploadablePending(queue, current)) {
    try {
      let info = current[entry.clientSessionId]!;
      if (!info.serverId) {
        info = await ensureSession(entry.clientSessionId, info, entry.request.location, deps);
        current[entry.clientSessionId] = info;
        cb.onSession(entry.clientSessionId, info);
      }
      const r = await uploadCapture(entry, info.serverId!, deps);
      cb.onUploaded(entry, r.observationId, cb.now());
      result.uploaded += 1;
    } catch (e) {
      if (stopsPass(e)) return stop(e);
      // Refused for this capture only (e.g. VALIDATION_FAILED): keep it PENDING and go on with the rest.
      result.failed += 1;
      result.error = e as Error;
    }
  }

  for (const [id, info] of Object.entries(current)) {
    if (!info.endedAt || !info.serverId || info.endReported) continue;
    try {
      await deps.client.endSession(info.serverId, { status: "ENDED", endedAt: info.endedAt });
      const next = { ...info, endReported: true };
      current[id] = next;
      cb.onSession(id, next);
    } catch (e) {
      if (stopsPass(e)) return stop(e);
      result.error = e as Error;
    }
  }
  return result;
}

/** Plain words for the screen, plus the request id to quote in a report. */
export function describeUploadError(e: unknown): { text: string; requestId: string | null } {
  if (e instanceof AstigApiError) {
    const text =
      e.code === "NETWORK_ERROR"
        ? "No connection to ASTIG. Uploads resume automatically."
        : isAuthProblem(e)
          ? "Signed out. Sign in again to resume uploads."
          : e.code === "FORBIDDEN"
            ? "This account can't upload captures (needs the OPERATOR role)."
            : e.retryable
              ? `ASTIG is not available right now (${e.status}). Uploads resume automatically.`
              : e.message;
    return { text, requestId: e.requestId ?? null };
  }
  return { text: e instanceof Error ? e.message : String(e), requestId: null };
}
