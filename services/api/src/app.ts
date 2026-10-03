import {
  AnalyticsSummaryResponse,
  CreateWorkOrderRequest,
  CreateWorkOrderResponse,
  CreateSessionRequest,
  CreateUploadUrlRequest,
  EndSessionRequest,
  ErrorResponse,
  IssueDetailResponse,
  IssueListQuery,
  IssueListResponse,
  ObservationCaptureRequest,
  RegisterObservationResponse,
  SessionResponse,
  UpdateWorkOrderRequest,
  UpdateWorkOrderResponse,
  UploadUrlResponse,
  Uuid,
  type Role,
} from "@astig/contracts";
import { DataError, registerObservation, withTransaction } from "@astig/database";
import type { Pool, PoolClient } from "pg";
import type { z } from "zod";
import { authenticate, requireRole, type AuthMode, type Principal } from "./auth";
import { ApiError, validationError } from "./errors";
import type { EvidenceUploadSigner, EvidenceUrlSigner } from "./evidence";
import { MAX_BODY_BYTES, type ApiRequest, type ApiResponse } from "./http";
import { getIssueDetail } from "./repositories/issues";
import { analyticsSummary, listIssues } from "./repositories/issue-list";
import { createSession, endSession } from "./repositories/sessions";
import { createUploadUrl } from "./repositories/uploads";
import { createWorkOrder, updateWorkOrder } from "./repositories/work-orders";

export interface AppDeps {
  pool: Pool;
  authMode: AuthMode;
  evidenceSigner: EvidenceUrlSigner | null;
  /** Null when no evidence bucket is configured; upload URLs then fail with SERVICE_UNAVAILABLE. */
  uploadSigner?: EvidenceUploadSigner | null;
  log?: (entry: Record<string, unknown>) => void;
}

interface RouteContext {
  req: ApiRequest;
  principal: Principal;
  params: string[];
}

interface Route {
  method: string;
  name: string;
  pattern: RegExp;
  role: Role;
  handle: (ctx: RouteContext) => Promise<{ status: number; body: unknown; schema: z.ZodType }>;
}

const JSON_HEADERS = { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" };

function parseId(raw: string, label: string): string {
  const r = Uuid.safeParse(raw);
  if (!r.success) throw new ApiError("VALIDATION_FAILED", `${label} must be a UUID.`);
  return r.data.toLowerCase();
}

function parseBody<T extends z.ZodType>(req: ApiRequest, schema: T): z.infer<T> {
  if (req.body === null || req.body.length === 0) throw new ApiError("VALIDATION_FAILED", "A JSON request body is required.");
  if (Buffer.byteLength(req.body, "utf8") > MAX_BODY_BYTES) throw new ApiError("VALIDATION_FAILED", "Request body is too large.");
  let json: unknown;
  try {
    json = JSON.parse(req.body);
  } catch {
    throw new ApiError("VALIDATION_FAILED", "Request body is not valid JSON.");
  }
  const r = schema.safeParse(json);
  if (!r.success) throw validationError(r.error);
  return r.data;
}

async function readSnapshot<T>(pool: Pool, fn: (c: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
}

export function createApp(deps: AppDeps): (req: ApiRequest) => Promise<ApiResponse> {
  const log = deps.log ?? ((entry) => console.log(JSON.stringify(entry)));

  const routes: Route[] = [
    {
      method: "GET",
      name: "GET /issues",
      pattern: /^\/issues$/,
      role: "OFFICER",
      handle: async ({ req }) => {
        const parsed = IssueListQuery.safeParse(req.query ?? {});
        if (!parsed.success) throw validationError(parsed.error, "Query parameters are invalid.");
        const body = await readSnapshot(deps.pool, (c) => listIssues(c, parsed.data));
        return { status: 200, body, schema: IssueListResponse };
      },
    },
    {
      method: "GET",
      name: "GET /analytics/summary",
      pattern: /^\/analytics\/summary$/,
      role: "OFFICER",
      handle: async () => {
        const body = await readSnapshot(deps.pool, (c) => analyticsSummary(c));
        return { status: 200, body, schema: AnalyticsSummaryResponse };
      },
    },
    {
      method: "GET",
      name: "GET /issues/{id}",
      pattern: /^\/issues\/([^/]+)$/,
      role: "OFFICER",
      handle: async ({ params }) => {
        const issueId = parseId(params[0]!, "issue id");
        const body = await readSnapshot(deps.pool, (c) => getIssueDetail(c, issueId, deps.evidenceSigner));
        return { status: 200, body, schema: IssueDetailResponse };
      },
    },
    {
      method: "POST",
      name: "POST /issues/{id}/work-orders",
      pattern: /^\/issues\/([^/]+)\/work-orders$/,
      role: "OFFICER",
      handle: async ({ req, params, principal }) => {
        const issueId = parseId(params[0]!, "issue id");
        const request = parseBody(req, CreateWorkOrderRequest);
        const result = await withTransaction(deps.pool, (c) =>
          createWorkOrder(c, { issueId, request, actorSubject: principal.subject }),
        );
        return { status: result.created ? 201 : 200, body: result, schema: CreateWorkOrderResponse };
      },
    },
    {
      method: "PATCH",
      name: "PATCH /work-orders/{id}",
      pattern: /^\/work-orders\/([^/]+)$/,
      role: "OFFICER",
      handle: async ({ req, params, principal }) => {
        const workOrderId = parseId(params[0]!, "work order id");
        const request = parseBody(req, UpdateWorkOrderRequest);
        const workOrder = await withTransaction(deps.pool, (c) =>
          updateWorkOrder(c, { workOrderId, request, actorSubject: principal.subject }),
        );
        return { status: 200, body: { workOrder }, schema: UpdateWorkOrderResponse };
      },
    },
    {
      method: "POST",
      name: "POST /sessions",
      pattern: /^\/sessions$/,
      role: "OPERATOR",
      handle: async ({ req, principal }) => {
        const request = parseBody(req, CreateSessionRequest);
        const result = await withTransaction(deps.pool, (c) => createSession(c, { request, operatorSubject: principal.subject }));
        return { status: result.created ? 201 : 200, body: result, schema: SessionResponse };
      },
    },
    {
      method: "PATCH",
      name: "PATCH /sessions/{id}",
      pattern: /^\/sessions\/([^/]+)$/,
      role: "OPERATOR",
      handle: async ({ req, params, principal }) => {
        const sessionId = parseId(params[0]!, "session id");
        const request = parseBody(req, EndSessionRequest);
        const session = await withTransaction(deps.pool, (c) =>
          endSession(c, { sessionId, request, operatorSubject: principal.subject }),
        );
        return { status: 200, body: { session }, schema: SessionResponse };
      },
    },
    {
      method: "POST",
      name: "POST /sessions/{id}/observations",
      pattern: /^\/sessions\/([^/]+)\/observations$/,
      role: "OPERATOR",
      handle: async ({ req, params, principal }) => {
        const sessionId = parseId(params[0]!, "session id");
        const capture = parseBody(req, ObservationCaptureRequest);
        const result = await withTransaction(deps.pool, (c) =>
          registerObservation(c, { sessionId, actorSubject: principal.subject, capture }),
        );
        const o = result.observation;
        const body = {
          created: result.created,
          observation: {
            id: o.id,
            sessionId: o.sessionId,
            clientObservationId: o.clientObservationId,
            processingStatus: o.processingStatus,
            isSynthetic: o.isSynthetic,
            createdAt: o.createdAt,
          },
        };
        return { status: result.created ? 201 : 200, body, schema: RegisterObservationResponse };
      },
    },
    {
      method: "POST",
      name: "POST /upload-url",
      pattern: /^\/upload-url$/,
      role: "OPERATOR",
      handle: async ({ req, principal }) => {
        const request = parseBody(req, CreateUploadUrlRequest);
        const body = await readSnapshot(deps.pool, (c) =>
          createUploadUrl(c, { request, operatorSubject: principal.subject, signer: deps.uploadSigner ?? null }),
        );
        return { status: 200, body, schema: UploadUrlResponse };
      },
    },
  ];

  function errorResponse(err: ApiError, requestId: string): ApiResponse {
    const body: ErrorResponse = {
      error: { code: err.code, message: err.message, requestId, ...(err.details ? { details: err.details } : {}) },
    };
    return { statusCode: err.status, headers: JSON_HEADERS, body: JSON.stringify(body) };
  }

  return async function handle(req: ApiRequest): Promise<ApiResponse> {
    const started = Date.now();
    let routeName = "unmatched";
    try {
      const principal = authenticate(req, deps.authMode);
      const path = req.path.length > 1 ? req.path.replace(/\/+$/, "") : req.path;
      let match: { route: Route; params: string[] } | null = null;
      for (const route of routes) {
        const m = route.pattern.exec(path);
        if (m && route.method === req.method.toUpperCase()) {
          match = { route, params: m.slice(1).map(decodeURIComponent) };
          break;
        }
      }
      if (!match) throw new ApiError("NOT_FOUND", "Route not found.");
      routeName = match.route.name;
      requireRole(principal, match.route.role);

      const result = await match.route.handle({ req, principal, params: match.params });
      // Outbound contract check: a drift between DB mapping and the shared schema is a server bug.
      const checked = result.schema.safeParse(result.body);
      if (!checked.success) {
        throw new Error(`response for ${routeName} violates contract: ${checked.error.issues[0]?.path.join(".")} ${checked.error.issues[0]?.message}`);
      }
      log({ level: "info", requestId: req.requestId, route: routeName, status: result.status, durationMs: Date.now() - started });
      return { statusCode: result.status, headers: JSON_HEADERS, body: JSON.stringify(checked.data) };
    } catch (err) {
      const apiErr =
        err instanceof ApiError ? err : err instanceof DataError ? new ApiError(err.code, err.message) : null;
      if (apiErr) {
        log({ level: "warn", requestId: req.requestId, route: routeName, status: apiErr.status, code: apiErr.code, durationMs: Date.now() - started });
        return errorResponse(apiErr, req.requestId);
      }
      // Unexpected: log enough to debug (no request body, no SQL parameters), return a safe envelope.
      const e = err as Error;
      log({ level: "error", requestId: req.requestId, route: routeName, status: 500, errorName: e?.name, errorMessage: e?.message, durationMs: Date.now() - started });
      return errorResponse(new ApiError("INTERNAL_ERROR", "An unexpected error occurred."), req.requestId);
    }
  };
}
