import { createPoolFromEnv } from "@astig/database";
import { createApp } from "./app";
import { loadConfig } from "./config";
import type { ApiResponse } from "./http";
import { S3EvidenceStorage } from "./s3-evidence";

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

let handlerPromise: Promise<ReturnType<typeof createApp>> | undefined;

async function buildHandler(): Promise<ReturnType<typeof createApp>> {
  const config = loadConfig();
  // One small pool per Lambda container; total connections are bounded by Lambda concurrency.
  const pool = await createPoolFromEnv({ max: 2 });
  const storage = config.evidenceBucket ? new S3EvidenceStorage(config.evidenceBucket) : null;
  return createApp({ pool, authMode: config.authMode, evidenceSigner: storage, uploadSigner: storage });
}

/** Lambda entry point for API Gateway HTTP API with a JWT (Cognito) authorizer. */
export async function lambdaHandler(event: HttpApiEventV2): Promise<ApiResponse> {
  // CORS preflight arrives on the unauthenticated OPTIONS route. Answer it without touching
  // auth or data; API Gateway adds the configured CORS headers.
  if (event.requestContext.http.method === "OPTIONS") return { statusCode: 204, headers: {}, body: "" };
  handlerPromise ??= buildHandler().catch((err) => {
    handlerPromise = undefined; // retry initialization on the next request instead of caching failure
    throw err;
  });
  const handle = await handlerPromise;
  const headers = Object.fromEntries(Object.entries(event.headers ?? {}).map(([k, v]) => [k.toLowerCase(), v]));
  const body = event.body === undefined ? null : event.isBase64Encoded ? Buffer.from(event.body, "base64").toString("utf8") : event.body;
  return handle({
    method: event.requestContext.http.method,
    path: event.rawPath,
    headers,
    body,
    requestId: event.requestContext.requestId,
    jwtClaims: event.requestContext.authorizer?.jwt?.claims,
  });
}
