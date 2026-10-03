/** Transport-neutral request/response used by both the Lambda adapter and the local dev server. */
export interface ApiRequest {
  method: string;
  path: string;
  /** Decoded query-string parameters (last value wins for repeated keys). */
  query?: Record<string, string>;
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

export function parseQueryString(raw: string | undefined | null): Record<string, string> {
  const out: Record<string, string> = {};
  if (!raw) return out;
  for (const [k, v] of new URLSearchParams(raw)) out[k] = v;
  return out;
}
