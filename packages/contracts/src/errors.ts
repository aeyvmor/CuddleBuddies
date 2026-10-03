import { z } from "zod";

export const ErrorCode = z.enum([
  "VALIDATION_FAILED",
  "UNAUTHENTICATED",
  "FORBIDDEN",
  "NOT_FOUND",
  "INVALID_TRANSITION",
  "WORK_ORDER_CLOSED",
  "ISSUE_NOT_OPEN",
  "ACTIVE_WORK_ORDER_EXISTS",
  "RISK_ASSESSMENT_MISMATCH",
  "IDEMPOTENCY_CONFLICT",
  "INTERNAL_ERROR",
]);
export type ErrorCode = z.infer<typeof ErrorCode>;

export const ERROR_HTTP_STATUS: Record<ErrorCode, number> = {
  VALIDATION_FAILED: 400,
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  INVALID_TRANSITION: 409,
  WORK_ORDER_CLOSED: 409,
  ISSUE_NOT_OPEN: 409,
  ACTIVE_WORK_ORDER_EXISTS: 409,
  RISK_ASSESSMENT_MISMATCH: 409,
  IDEMPOTENCY_CONFLICT: 409,
  INTERNAL_ERROR: 500,
};

export const ErrorDetail = z.strictObject({
  path: z.string().max(200),
  message: z.string().max(300),
});

/** Consistent error envelope: stable machine code + safe message. Never includes stack traces or SQL. */
export const ErrorResponse = z.strictObject({
  error: z.strictObject({
    code: ErrorCode,
    message: z.string().min(1).max(300),
    requestId: z.string().min(1).max(100),
    details: z.array(ErrorDetail).max(50).optional(),
  }),
});
export type ErrorResponse = z.infer<typeof ErrorResponse>;
