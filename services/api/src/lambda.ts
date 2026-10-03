import pg from "pg";
import { createApp } from "./app";
import { loadConfig } from "./config";
import type { ApiResponse } from "./http";

/** Minimal subset of the API Gateway HTTP API (payload v2.0) event used here. */
interface HttpApiEventV2 {
  rawPath: string;
  headers?: Record<string, string | undefined>;
  body?: string;
  isBase64Encoded?: boolean;
  requestContext: {
    requestId: string;
    http: { method: string };
    authorizer?: { jwt?: { claims?: Record<string, unknown> } };
  };
}

let handler: ReturnType<typeof createApp> | undefined;

function getHandler(): ReturnType<typeof createApp> {
  if (!handler) {
    const config = loadConfig();
    // One small pool per Lambda container; connection count is bounded by Lambda concurrency.
    const pool = new pg.Pool({ connectionString: config.databaseUrl, max: 2, idleTimeoutMillis: 30_000 });
    handler = createApp({ pool, authMode: config.authMode, evidenceSigner: null });
  }
  return handler;
}

/** Lambda entry point for API Gateway HTTP API (JWT authorizer). Not deployed in this slice. */
export async function lambdaHandler(event: HttpApiEventV2): Promise<ApiResponse> {
  const headers = Object.fromEntries(Object.entries(event.headers ?? {}).map(([k, v]) => [k.toLowerCase(), v]));
  const body = event.body === undefined ? null : event.isBase64Encoded ? Buffer.from(event.body, "base64").toString("utf8") : event.body;
  return getHandler()({
    method: event.requestContext.http.method,
    path: event.rawPath,
    headers,
    body,
    requestId: event.requestContext.requestId,
    jwtClaims: event.requestContext.authorizer?.jwt?.claims,
  });
}
