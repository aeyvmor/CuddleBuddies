import { ERROR_HTTP_STATUS, type ErrorCode } from "@astig/contracts";
import type { z } from "zod";

/** An expected failure that maps to the shared error envelope. `message` must be safe for clients. */
export class ApiError extends Error {
  override readonly name = "ApiError";
  constructor(
    readonly code: ErrorCode,
    message: string,
    readonly details?: { path: string; message: string }[],
  ) {
    super(message);
  }

  get status(): number {
    return ERROR_HTTP_STATUS[this.code];
  }
}

export function validationError(error: z.ZodError, message = "Request validation failed."): ApiError {
  return new ApiError(
    "VALIDATION_FAILED",
    message,
    error.issues.slice(0, 50).map((i) => ({ path: i.path.join(".") || "(root)", message: i.message.slice(0, 300) })),
  );
}
