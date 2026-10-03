import type { Pool } from "pg";
import { describe, expect, it } from "vitest";
import { assertAuthModeAllowed, authenticate } from "../src/auth";
import { createApp } from "../src/app";
import { loadConfig } from "../src/config";
import type { ApiRequest } from "../src/http";

// A pool that fails if touched: proves auth/validation reject before any database access.
const untouchablePool = {
  connect: () => {
    throw new Error("database must not be reached");
  },
} as unknown as Pool;

const app = createApp({ pool: untouchablePool, authMode: "local-dev", evidenceSigner: null, log: () => undefined });
const ISSUE = "5e3d0004-0000-4000-8000-000000000001";

const req = (over: Partial<ApiRequest> = {}): ApiRequest => ({
  method: "GET",
  path: `/issues/${ISSUE}`,
  headers: { "x-astig-dev-subject": "demo-officer-01", "x-astig-dev-roles": "OFFICER" },
  body: null,
  requestId: "req-1",
  ...over,
});

const json = (body: string) => JSON.parse(body);

describe("auth boundary", () => {
  it("returns 401 with the error envelope when unauthenticated", async () => {
    const res = await app(req({ headers: {} }));
    expect(res.statusCode).toBe(401);
    expect(json(res.body)).toEqual({ error: { code: "UNAUTHENTICATED", message: "Authentication required.", requestId: "req-1" } });
  });

  it("returns 403 for an authenticated user without the OFFICER role", async () => {
    const res = await app(req({ headers: { "x-astig-dev-subject": "demo-operator-01", "x-astig-dev-roles": "OPERATOR" } }));
    expect(res.statusCode).toBe(403);
    expect(json(res.body).error.code).toBe("FORBIDDEN");
  });

  it("reads JWT subject and API Gateway-formatted group claims", () => {
    const p = authenticate(req({ headers: {}, jwtClaims: { sub: "abc", "cognito:groups": "[OFFICER OPERATOR UNKNOWN]" } }), "jwt");
    expect(p).toEqual({ subject: "abc", roles: ["OFFICER", "OPERATOR"] });
  });

  it("ignores dev headers in jwt mode", () => {
    expect(() => authenticate(req(), "jwt")).toThrow(/Authentication required/);
  });

  it("refuses local-dev auth inside Lambda or production", () => {
    expect(() => assertAuthModeAllowed("local-dev", { AWS_LAMBDA_FUNCTION_NAME: "fn" })).toThrow();
    expect(() => assertAuthModeAllowed("local-dev", { NODE_ENV: "production" })).toThrow();
    expect(() => loadConfig({ DATABASE_URL: "postgres://x", ASTIG_AUTH_MODE: "local-dev", AWS_LAMBDA_FUNCTION_NAME: "fn" })).toThrow();
  });

  it("fails loudly on missing configuration", () => {
    expect(() => loadConfig({ ASTIG_AUTH_MODE: "jwt" })).toThrow(/DATABASE_URL/);
    expect(() => loadConfig({ DATABASE_URL: "postgres://x" })).toThrow(/ASTIG_AUTH_MODE/);
  });
});

describe("request validation (before database access)", () => {
  it("rejects a non-UUID path id", async () => {
    const res = await app(req({ path: "/issues/not-a-uuid" }));
    expect(res.statusCode).toBe(400);
    expect(json(res.body).error.code).toBe("VALIDATION_FAILED");
  });

  it("rejects malformed JSON, empty and oversized bodies", async () => {
    const post = (body: string | null) => app(req({ method: "POST", path: `/issues/${ISSUE}/work-orders`, body }));
    expect((await post("{not json")).statusCode).toBe(400);
    expect((await post(null)).statusCode).toBe(400);
    expect((await post(JSON.stringify({ notes: "x".repeat(20_000) }))).statusCode).toBe(400);
  });

  it("returns field-level details for schema violations", async () => {
    const res = await app(req({ method: "PATCH", path: "/work-orders/5e3d0008-0000-4000-8000-000000000001", body: JSON.stringify({ status: "CLOSED" }) }));
    expect(res.statusCode).toBe(400);
    expect(json(res.body).error.details[0].path).toBe("status");
  });

  it("returns 404 for unknown routes and methods", async () => {
    expect((await app(req({ path: "/nope" }))).statusCode).toBe(404);
    expect((await app(req({ method: "DELETE" }))).statusCode).toBe(404);
  });

  it("hides internal error details behind INTERNAL_ERROR", async () => {
    const res = await app(req());
    expect(res.statusCode).toBe(500);
    expect(json(res.body).error).toEqual({ code: "INTERNAL_ERROR", message: "An unexpected error occurred.", requestId: "req-1" });
  });
});
