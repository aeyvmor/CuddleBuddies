import type { ErrorCode } from "@astig/contracts";

/** Stable error raised by the client. `code` is the API's machine-readable code when available. */
export class AstigApiError extends Error {
  override readonly name = "AstigApiError";
  constructor(
    /** HTTP status; 0 for network failures. */
    readonly status: number,
    readonly code: ErrorCode | "NETWORK_ERROR" | "AUTH_REQUIRED" | "UNEXPECTED_RESPONSE",
    message: string,
    readonly requestId?: string,
    readonly details?: { path: string; message: string }[],
  ) {
    super(message);
  }

  /** True for errors that are safe to retry with the same idempotent request. */
  get retryable(): boolean {
    return this.status === 0 || this.status === 429 || this.status >= 500;
  }
}
