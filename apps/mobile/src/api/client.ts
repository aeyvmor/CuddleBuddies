/**
 * Copied from packages/api-client/src/client.ts (commit 0a2f58c).
 * Adapted for the capture app: operator calls only (sessions, observations, upload URL,
 * image PUT), types from ./contracts.ts, explicit fields instead of parameter properties
 * (for `node --test`). The request/retry/error logic is unchanged.
 */
import type {
  CreateSessionRequest,
  CreateUploadUrlRequest,
  EndSessionRequest,
  ObservationCaptureRequest,
  RegisterObservationResponse,
  SessionResponse,
  UploadUrlResponse,
} from "./contracts.ts";
import { AstigApiError } from "./errors.ts";

export interface AstigClientConfig {
  baseUrl: string;
  /** Returns a valid bearer token (e.g. CognitoAuth.getAccessToken). */
  getToken: () => Promise<string>;
  fetchImpl?: typeof fetch;
  /** Retries for idempotent/safe calls on network errors, 429 and 5xx (default 3). */
  maxRetries?: number;
  /** Called when the API says the token is invalid (401). */
  onUnauthenticated?: () => void;
  sleep?: (ms: number) => Promise<void>;
}

/** Image bytes accepted by fetch: a Blob or Blob-like (expo-file-system File), ArrayBuffer or Uint8Array. */
export type UploadBody = Blob | ArrayBuffer | Uint8Array;

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Thin typed client over the ASTIG HTTP API. Every write is idempotent, so retries never duplicate data. */
export class AstigClient {
  private readonly cfg: AstigClientConfig;
  private readonly base: string;
  private readonly fetchImpl: typeof fetch;
  private readonly sleep: (ms: number) => Promise<void>;

  constructor(cfg: AstigClientConfig) {
    this.cfg = cfg;
    this.base = cfg.baseUrl.replace(/\/+$/, "");
    this.fetchImpl = cfg.fetchImpl ?? ((...a: Parameters<typeof fetch>) => fetch(...a));
    this.sleep = cfg.sleep ?? defaultSleep;
  }

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const max = this.cfg.maxRetries ?? 3;
    for (let attempt = 0; ; attempt++) {
      const token = await this.cfg.getToken();
      let res: Response;
      try {
        res = await this.fetchImpl(`${this.base}${path}`, {
          method,
          headers: { authorization: `Bearer ${token}`, ...(body === undefined ? {} : { "content-type": "application/json" }) },
          body: body === undefined ? undefined : JSON.stringify(body),
        });
      } catch {
        if (attempt < max) {
          await this.sleep(300 * 2 ** attempt);
          continue;
        }
        throw new AstigApiError(0, "NETWORK_ERROR", "Network error. Check your connection and try again.");
      }
      const text = await res.text();
      let json: any = null;
      try {
        json = text ? JSON.parse(text) : null;
      } catch {
        /* non-JSON (e.g. gateway error page) */
      }
      if (res.ok) return json as T;
      const e = json?.error;
      const err = new AstigApiError(res.status, e?.code ?? (res.status === 401 ? "UNAUTHENTICATED" : "UNEXPECTED_RESPONSE"), e?.message ?? json?.message ?? `Request failed (${res.status}).`, e?.requestId, e?.details);
      if (res.status === 401) this.cfg.onUnauthenticated?.();
      if (err.retryable && attempt < max) {
        await this.sleep(300 * 2 ** attempt);
        continue;
      }
      throw err;
    }
  }

  startSession(body: CreateSessionRequest): Promise<SessionResponse> {
    return this.request("POST", "/sessions", body);
  }
  endSession(sessionId: string, body: EndSessionRequest): Promise<SessionResponse> {
    return this.request("PATCH", `/sessions/${encodeURIComponent(sessionId)}`, body);
  }
  registerObservation(sessionId: string, body: ObservationCaptureRequest): Promise<RegisterObservationResponse> {
    return this.request("POST", `/sessions/${encodeURIComponent(sessionId)}/observations`, body);
  }
  /** Presigned PUT for an observation image. A 409 ALREADY_UPLOADED means the upload already succeeded. */
  createUploadUrl(body: CreateUploadUrlRequest): Promise<UploadUrlResponse> {
    return this.request("POST", "/upload-url", body);
  }

  /** PUTs image bytes to a presigned URL with exactly the signed headers (content-length comes from the body). */
  async uploadImage(upload: { url: string; headers: Record<string, string> }, data: UploadBody): Promise<void> {
    let res: Response;
    try {
      const headers = Object.fromEntries(Object.entries(upload.headers).filter(([k]) => k.toLowerCase() !== "content-length"));
      res = await this.fetchImpl(upload.url, { method: "PUT", headers, body: data as unknown as RequestInit["body"] });
    } catch {
      throw new AstigApiError(0, "NETWORK_ERROR", "Upload failed: network error.");
    }
    if (!res.ok) throw new AstigApiError(res.status, "UNEXPECTED_RESPONSE", `Upload rejected by storage (${res.status}). The URL may have expired or the size/type changed.`);
  }
}
