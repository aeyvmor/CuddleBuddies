/**
 * Copied from packages/api-client/src/errors.ts (commit 0a2f58c).
 * Adapted: explicit fields instead of TypeScript parameter properties, so `node --test`
 * (type stripping only) can run it; ErrorCode comes from ./contracts.ts.
 */
import type { ErrorCode } from "./contracts.ts";

/** Stable error raised by the client. `code` is the API's machine-readable code when available. */
export class AstigApiError extends Error {
  override readonly name = "AstigApiError";
  /** HTTP status; 0 for network failures. */
  readonly status: number;
  readonly code: ErrorCode | "NETWORK_ERROR" | "AUTH_REQUIRED" | "UNEXPECTED_RESPONSE";
  readonly requestId?: string;
  readonly details?: { path: string; message: string }[];

  constructor(
    status: number,
    code: ErrorCode | "NETWORK_ERROR" | "AUTH_REQUIRED" | "UNEXPECTED_RESPONSE",
    message: string,
    requestId?: string,
    details?: { path: string; message: string }[],
  ) {
    super(message);
    this.status = status;
    this.code = code;
    this.requestId = requestId;
    this.details = details;
  }

  /** True for errors that are safe to retry with the same idempotent request. */
  get retryable(): boolean {
    return this.status === 0 || this.status === 429 || this.status >= 500;
  }
}
