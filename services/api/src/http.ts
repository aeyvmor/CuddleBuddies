/** Transport-neutral request/response used by both the Lambda adapter and the local dev server. */
export interface ApiRequest {
  method: string;
  path: string;
  /** Lower-cased header names. */
  headers: Record<string, string | undefined>;
  body: string | null;
  requestId: string;
  /** Claims verified by the API Gateway JWT authorizer (Lambda only). */
  jwtClaims?: Record<string, unknown>;
}

export interface ApiResponse {
  statusCode: number;
  headers: Record<string, string>;
  body: string;
}

export const MAX_BODY_BYTES = 16 * 1024;
