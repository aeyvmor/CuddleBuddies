import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { MAX_UPLOAD_BYTES, OBSERVATION_CAPTURE_SCHEMA_VERSION, type ObservationCaptureRequest } from "@astig/contracts";
import { frameFileName, type ReplayPlan } from "./plan";

export interface ReplayConfig {
  apiUrl: string;
  token: string;
  deviceId: string;
  vehicleId: string;
  /** Directory containing curated, redacted frames named like the plan (000001.jpg ...). */
  redactedDir: string;
  /** Only upload frames whose files exist (curation = deleting unusable frames). */
  fetchImpl?: typeof fetch;
  log?: (m: string) => void;
  /** Skip the session end call (for resuming partial runs). */
  keepSessionOpen?: boolean;
}

export interface ReplaySummary {
  sessionId: string;
  planned: number;
  skippedMissing: number;
  registered: number;
  alreadyRegistered: number;
  uploaded: number;
  alreadyUploaded: number;
}

class HttpError extends Error {
  constructor(readonly status: number, readonly code: string | undefined, message: string) {
    super(message);
  }
}

/**
 * Replays curated frames through the real API exactly as the mobile client would:
 * start session → register observation → presigned upload URL → PUT to S3.
 * Every id is deterministic (from the plan), so re-running after any failure is safe:
 * the API returns existing records and ALREADY_UPLOADED for finished uploads.
 */
export async function replay(plan: ReplayPlan, cfg: ReplayConfig): Promise<ReplaySummary> {
  const doFetch = cfg.fetchImpl ?? fetch;
  const base = cfg.apiUrl.replace(/\/+$/, "");
  const log = cfg.log ?? (() => undefined);

  async function api<T>(method: string, route: string, body: unknown, attempt = 1): Promise<T> {
    const res = await doFetch(`${base}${route}`, {
      method,
      headers: { authorization: `Bearer ${cfg.token}`, "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const text = await res.text();
    const json = text ? JSON.parse(text) : {};
    if (res.ok) return json as T;
    // Throttling or transient server errors: back off and retry (idempotent calls).
    if ((res.status === 429 || res.status >= 500) && attempt < 5) {
      await new Promise((r) => setTimeout(r, 500 * 2 ** attempt));
      return api<T>(method, route, body, attempt + 1);
    }
    throw new HttpError(res.status, json?.error?.code, `${method} ${route} → ${res.status} ${json?.error?.code ?? ""} ${json?.error?.message ?? ""}`.trim());
  }

  await api("POST", "/sessions", {
    clientSessionId: plan.sessionId,
    deviceId: cfg.deviceId,
    vehicleId: cfg.vehicleId,
    startedAt: plan.recordedStartUtc,
    startLocation: plan.startLocation,
  });
  log(`session ${plan.sessionId} ready`);

  const summary: ReplaySummary = { sessionId: plan.sessionId, planned: plan.frames.length, skippedMissing: 0, registered: 0, alreadyRegistered: 0, uploaded: 0, alreadyUploaded: 0 };
  let previousDistance: number | null = null;
  let sequence = 0;

  for (const f of plan.frames) {
    const file = path.join(cfg.redactedDir, frameFileName(f.index));
    const info = await stat(file).catch(() => null);
    if (!info) {
      summary.skippedMissing++;
      continue;
    }
    if (info.size === 0 || info.size > MAX_UPLOAD_BYTES) throw new Error(`${file} must be 1 byte to 10 MiB`);

    const capture: ObservationCaptureRequest = {
      schemaVersion: OBSERVATION_CAPTURE_SCHEMA_VERSION,
      clientObservationId: f.clientObservationId,
      // Sequence follows the plan index so retries reproduce identical metadata.
      sequenceNumber: f.index,
      capturedAt: f.capturedAt,
      location: { latitude: f.latitude, longitude: f.longitude },
      horizontalAccuracyM: plan.locationAccuracyM,
      samplingMethod: "DASHCAM_REPLAY",
      distanceFromPreviousM: previousDistance === null ? null : Math.round((f.distanceAlongRouteM - previousDistance) * 100) / 100,
    };
    // The distance is relative to the previous *planned* frame so retries stay identical,
    // even if curation removed frames in between.
    previousDistance = f.distanceAlongRouteM;
    sequence++;

    const reg = await api<{ created: boolean; observation: { id: string } }>("POST", `/sessions/${plan.sessionId}/observations`, capture);
    if (reg.created) summary.registered++;
    else summary.alreadyRegistered++;

    try {
      const up = await api<{ url: string; headers: Record<string, string> }>("POST", "/upload-url", {
        observationId: reg.observation.id,
        contentType: "image/jpeg",
        contentLengthBytes: info.size,
      });
      const bytes = await readFile(file);
      const put = await doFetch(up.url, { method: "PUT", headers: up.headers, body: bytes });
      if (!put.ok) throw new Error(`S3 PUT for frame ${f.index} failed with ${put.status}`);
      summary.uploaded++;
    } catch (err) {
      if (err instanceof HttpError && err.code === "ALREADY_UPLOADED") summary.alreadyUploaded++;
      else throw err;
    }
    if (sequence % 10 === 0) log(`frame ${f.index}: ${summary.uploaded} uploaded, ${summary.alreadyUploaded} already done`);
  }

  if (!cfg.keepSessionOpen) {
    try {
      await api("PATCH", `/sessions/${plan.sessionId}`, { status: "ENDED", endedAt: plan.endedAt });
    } catch (err) {
      // A previous run already ended it with the same time → fine; anything else is surfaced.
      if (!(err instanceof HttpError && err.code === "INVALID_TRANSITION")) throw err;
      log("session was already ended");
    }
  }
  return summary;
}

/** Cognito USER_PASSWORD_AUTH via the public endpoint (no AWS credentials needed). */
export async function cognitoLogin(params: { region: string; clientId: string; username: string; password: string; fetchImpl?: typeof fetch }): Promise<string> {
  const doFetch = params.fetchImpl ?? fetch;
  const res = await doFetch(`https://cognito-idp.${params.region}.amazonaws.com/`, {
    method: "POST",
    headers: { "content-type": "application/x-amz-json-1.1", "x-amz-target": "AWSCognitoIdentityProviderService.InitiateAuth" },
    body: JSON.stringify({ AuthFlow: "USER_PASSWORD_AUTH", ClientId: params.clientId, AuthParameters: { USERNAME: params.username, PASSWORD: params.password } }),
  });
  const json: any = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Cognito sign-in failed (${res.status} ${json?.__type ?? ""}). Check username/password; a new user must set a permanent password first.`);
  const token = json?.AuthenticationResult?.AccessToken;
  if (!token) throw new Error(`Cognito sign-in needs an extra step (${json?.ChallengeName ?? "unknown"}); set a permanent password for this user first.`);
  return token;
}
