import type {
  AnalyticsSummaryResponse,
  CreateResolutionEvidenceRequest,
  CreateSessionRequest,
  CreateUploadUrlRequest,
  CreateWorkOrderRequest,
  CreateWorkOrderResponse,
  EndSessionRequest,
  IssueDetailResponse,
  IssueListResponse,
  ObservationCaptureRequest,
  RegisterObservationResponse,
  ResolutionEvidenceResponse,
  SessionResponse,
  UpdateWorkOrderRequest,
  UpdateWorkOrderResponse,
  UploadUrlResponse,
} from "@astig/contracts";
import { AstigApiError } from "./errors";

/** Query for GET /issues. `bbox` is [minLon, minLat, maxLon, maxLat]. */
export interface ListIssuesParams {
  issueType?: string;
  severity?: string;
  areaName?: string;
  status?: "OPEN" | "RESOLVED";
  workOrderStatus?: "OPEN" | "IN_PROGRESS" | "RESOLVED" | "NONE";
  bbox?: [number, number, number, number];
  limit?: number;
  cursor?: string;
}

export interface AstigClientConfig {
  /** e.g. https://2jpf5wobhl.execute-api.ap-southeast-1.amazonaws.com (no trailing slash needed). */
  baseUrl: string;
  /** Returns a valid bearer token (e.g. CognitoAuth.getAccessToken). */
  getToken: () => Promise<string>;
  fetchImpl?: typeof fetch;
  /** Retries for idempotent/safe calls on network errors, 429 and 5xx (default 3). */
  maxRetries?: number;
  /** Called when the API says the token is invalid (401), e.g. to show the login screen. */
  onUnauthenticated?: () => void;
  sleep?: (ms: number) => Promise<void>;
}

/** Image bytes accepted by fetch on every platform we target (Blob in browser/React Native). */
export type UploadBody = Blob | ArrayBuffer | Uint8Array;

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * Thin typed client over the ASTIG HTTP API. Every write the API offers is idempotent
 * (client-generated ids / idempotency keys), so retries never duplicate data.
 */
export class AstigClient {
  private readonly base: string;
  private readonly fetchImpl: typeof fetch;
  private readonly sleep: (ms: number) => Promise<void>;

  constructor(private readonly cfg: AstigClientConfig) {
    this.base = cfg.baseUrl.replace(/\/+$/, "");
    this.fetchImpl = cfg.fetchImpl ?? ((...a: Parameters<typeof fetch>) => fetch(...a));
    this.sleep = cfg.sleep ?? defaultSleep;
  }

  private async request<T>(method: string, path: string, body?: unknown, query?: Record<string, string>): Promise<T> {
    const qs = query && Object.keys(query).length ? `?${new URLSearchParams(query).toString()}` : "";
    const max = this.cfg.maxRetries ?? 3;
    for (let attempt = 0; ; attempt++) {
      const token = await this.cfg.getToken();
      let res: Response;
      try {
        res = await this.fetchImpl(`${this.base}${path}${qs}`, {
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

  // ---------------- Officer (web dashboard) ----------------
  listIssues(p: ListIssuesParams = {}): Promise<IssueListResponse> {
    const q: Record<string, string> = {};
    for (const [k, v] of Object.entries(p)) if (v !== undefined) q[k] = Array.isArray(v) ? v.join(",") : String(v);
    return this.request("GET", "/issues", undefined, q);
  }
  getIssue(issueId: string): Promise<IssueDetailResponse> {
    return this.request("GET", `/issues/${encodeURIComponent(issueId)}`);
  }
  createWorkOrder(issueId: string, body: CreateWorkOrderRequest): Promise<CreateWorkOrderResponse> {
    return this.request("POST", `/issues/${encodeURIComponent(issueId)}/work-orders`, body);
  }
  updateWorkOrder(workOrderId: string, body: UpdateWorkOrderRequest): Promise<UpdateWorkOrderResponse> {
    return this.request("PATCH", `/work-orders/${encodeURIComponent(workOrderId)}`, body);
  }
  analyticsSummary(): Promise<AnalyticsSummaryResponse> {
    return this.request("GET", "/analytics/summary");
  }
  /** Registers an "after" photo for a work order and returns a presigned PUT (see uploadImage). */
  createResolutionEvidence(workOrderId: string, body: CreateResolutionEvidenceRequest): Promise<ResolutionEvidenceResponse> {
    return this.request("POST", `/work-orders/${encodeURIComponent(workOrderId)}/resolution-evidence`, body);
  }

  // ---------------- Operator (mobile capture) ----------------
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

  /**
   * PUTs image bytes to a presigned URL with exactly the signed headers. Pass a Blob/ArrayBuffer
   * (browser) or a Uint8Array. React Native can pass a Blob from `fetch(fileUri).then(r => r.blob())`.
   */
  async uploadImage(upload: { url: string; headers: Record<string, string> }, data: UploadBody): Promise<void> {
    let res: Response;
    try {
      // content-length is set by the platform from the body; sending it manually is forbidden in browsers.
      const headers = Object.fromEntries(Object.entries(upload.headers).filter(([k]) => k.toLowerCase() !== "content-length"));
      res = await this.fetchImpl(upload.url, { method: "PUT", headers, body: data as unknown as RequestInit["body"] });
    } catch {
      throw new AstigApiError(0, "NETWORK_ERROR", "Upload failed: network error.");
    }
    if (!res.ok) throw new AstigApiError(res.status, "UNEXPECTED_RESPONSE", `Upload rejected by storage (${res.status}). The URL may have expired or the size/type changed.`);
  }

  /**
   * Full capture step for one image: register metadata, get an upload URL, PUT the bytes.
   * Safe to call again after any failure with the same `capture` (same clientObservationId).
   */
  async submitCapture(sessionId: string, capture: ObservationCaptureRequest, image: { data: UploadBody; byteLength: number }): Promise<{ observationId: string; uploaded: "NOW" | "ALREADY" }> {
    const reg = await this.registerObservation(sessionId, capture);
    try {
      const up = await this.createUploadUrl({ observationId: reg.observation.id, contentType: "image/jpeg", contentLengthBytes: image.byteLength });
      await this.uploadImage(up, image.data);
      return { observationId: reg.observation.id, uploaded: "NOW" };
    } catch (err) {
      if (err instanceof AstigApiError && err.code === "ALREADY_UPLOADED") return { observationId: reg.observation.id, uploaded: "ALREADY" };
      throw err;
    }
  }
}
