/**
 * Types for the operator API calls, mirrored by hand from packages/contracts/src
 * (session.ts, observation.ts, errors.ts at commit 0a2f58c). apps/mobile is outside the npm
 * workspaces, so it cannot import @astig/contracts; keep these in step with the contract.
 * CaptureRequest (src/capture.ts) is the ObservationCaptureRequest shape.
 */
import type { CaptureRequest } from "../capture.ts";

export type ErrorCode =
  | "VALIDATION_FAILED"
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "INVALID_TRANSITION"
  | "WORK_ORDER_CLOSED"
  | "ISSUE_NOT_OPEN"
  | "ACTIVE_WORK_ORDER_EXISTS"
  | "RISK_ASSESSMENT_MISMATCH"
  | "IDEMPOTENCY_CONFLICT"
  | "ALREADY_UPLOADED"
  | "INTERNAL_ERROR"
  | "SERVICE_UNAVAILABLE";

export interface Coordinates {
  latitude: number;
  longitude: number;
}

/** POST /sessions. clientSessionId becomes the session id. */
export interface CreateSessionRequest {
  clientSessionId: string;
  deviceId: string;
  vehicleId: string;
  startedAt: string;
  startLocation: Coordinates;
}

/** PATCH /sessions/{id}. Ending again with the same time is a no-op. */
export interface EndSessionRequest {
  status: "ENDED";
  endedAt: string;
}

export interface SessionResponse {
  created?: boolean;
  session: { id: string; status: "ACTIVE" | "ENDED"; startedAt: string; endedAt: string | null };
}

export type ObservationCaptureRequest = CaptureRequest;

export interface RegisterObservationResponse {
  created: boolean;
  observation: { id: string; sessionId: string; clientObservationId: string; processingStatus: string; isSynthetic: boolean; createdAt: string };
}

/** contracts: MAX_UPLOAD_BYTES. */
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

export interface CreateUploadUrlRequest {
  observationId: string;
  contentType: "image/jpeg";
  contentLengthBytes: number;
}

export interface UploadUrlResponse {
  method: "PUT";
  url: string;
  headers: { "content-type": "image/jpeg"; "content-length": string };
  expiresAt: string;
}
