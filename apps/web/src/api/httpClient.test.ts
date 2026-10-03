import { describe, expect, it, vi } from "vitest";
import { AstigApiError, AstigClient } from "@astig/api-client";
import { createHttpApi, FORBIDDEN_TEXT, LIST_PAGE_LIMIT, SIGNED_OUT_TEXT } from "./httpClient";
import { ApiError } from "./types";
import { createSyntheticIssues } from "../data/syntheticData";

const BASE = "https://api.test";
const details = createSyntheticIssues();
const item = (i: number) => ({ issue: details[i]!.issue, severity: "HIGH" as const, totalScore: 50, workOrderStatus: null });

interface Call {
  method: string;
  url: URL;
  headers: Record<string, string>;
  body: unknown;
}

/** A fake fetch that records requests and answers from a handler. */
function fakeFetch(handler: (c: Call) => { status: number; json?: unknown }) {
  const calls: Call[] = [];
  const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const headers = Object.fromEntries(Object.entries((init?.headers ?? {}) as Record<string, string>).map(([k, v]) => [k.toLowerCase(), v]));
    const body = typeof init?.body === "string" ? JSON.parse(init.body) : init?.body;
    const call = { method: init?.method ?? "GET", url: new URL(String(input)), headers, body };
    calls.push(call);
    const r = handler(call);
    return new Response(r.json === undefined ? null : JSON.stringify(r.json), { status: r.status, headers: { "content-type": "application/json" } });
  });
  return { calls, fetchImpl: fetchImpl as unknown as typeof fetch };
}

function setup(handler: Parameters<typeof fakeFetch>[0], getToken: () => Promise<string> = async () => "token-123") {
  const f = fakeFetch(handler);
  const onAuthLost = vi.fn();
  const client = new AstigClient({ baseUrl: BASE, getToken, fetchImpl: f.fetchImpl, maxRetries: 1, sleep: async () => {} });
  return { ...f, onAuthLost, api: createHttpApi({ client, onAuthLost }) };
}

const envelope = (code: string, message: string, requestId = "req-42") => ({ error: { code, message, requestId } });

describe("HTTP client mapping", () => {
  it("maps filters to GET /issues, sends the bearer token, and follows nextCursor", async () => {
    const { api, calls } = setup((c) =>
      c.url.searchParams.get("cursor") === "p2"
        ? { status: 200, json: { items: [item(1)], nextCursor: null, areaNames: ["ignored"] } }
        : { status: 200, json: { items: [item(0)], nextCursor: "p2", areaNames: ["Demo Zone A", "Manila"] } },
    );
    const res = await api.listIssues({ severity: "CRITICAL", issueType: "BLOCKED_DRAIN", areaName: "Manila", status: "OPEN", workOrderStatus: "NONE" });
    expect(calls).toHaveLength(2);
    const q = calls[0]!.url.searchParams;
    expect(calls[0]!.url.pathname).toBe("/issues");
    expect(Object.fromEntries(q)).toEqual({
      limit: String(LIST_PAGE_LIMIT),
      severity: "CRITICAL",
      issueType: "BLOCKED_DRAIN",
      areaName: "Manila",
      status: "OPEN",
      workOrderStatus: "NONE",
    });
    expect(calls[1]!.url.searchParams.get("cursor")).toBe("p2");
    expect(calls[0]!.headers.authorization).toBe("Bearer token-123");
    expect(res.items.map((i) => i.issue.id)).toEqual([details[0]!.issue.id, details[1]!.issue.id]);
    expect(res.areaNames).toEqual(["Demo Zone A", "Manila"]);
    expect(res.nextCursor).toBeNull();
  });

  it("sends no empty filters", async () => {
    const { api, calls } = setup(() => ({ status: 200, json: { items: [], nextCursor: null, areaNames: [] } }));
    await api.listIssues({});
    expect(Object.fromEntries(calls[0]!.url.searchParams)).toEqual({ limit: String(LIST_PAGE_LIMIT) });
  });

  it("creates a work order with the reviewed score and the action's idempotency key", async () => {
    const { api, calls } = setup(() => ({ status: 201, json: { created: true, workOrder: details[1]!.workOrders[0] } }));
    await api.createWorkOrder("issue-1", { idempotencyKey: "11111111-1111-4111-8111-111111111111", riskAssessmentId: "risk-1", assignedTeam: "Drainage" });
    expect(calls[0]!.method).toBe("POST");
    expect(calls[0]!.url.pathname).toBe("/issues/issue-1/work-orders");
    expect(calls[0]!.body).toEqual({ idempotencyKey: "11111111-1111-4111-8111-111111111111", riskAssessmentId: "risk-1", assignedTeam: "Drainage" });
  });

  it("turns a 409 into an ApiError with the code, message and requestId (a conflict, not a crash)", async () => {
    const { api } = setup(() => ({ status: 409, json: envelope("INVALID_TRANSITION", "Cannot move a work order from OPEN to RESOLVED.") }));
    const e = await api.updateWorkOrder("wo-1", { status: "RESOLVED" }).catch((x: unknown) => x);
    expect(e).toBeInstanceOf(ApiError);
    expect(e).toMatchObject({ code: "INVALID_TRANSITION", status: 409, requestId: "req-42", message: "Cannot move a work order from OPEN to RESOLVED." });
    expect((e as ApiError).isConflict).toBe(true);
  });

  it("explains FORBIDDEN as a missing officer role", async () => {
    const { api, onAuthLost } = setup(() => ({ status: 403, json: envelope("FORBIDDEN", "Requires role OFFICER.") }));
    await expect(api.listIssues({})).rejects.toMatchObject({ code: "FORBIDDEN", message: FORBIDDEN_TEXT });
    expect(onAuthLost).not.toHaveBeenCalled();
  });

  it("returns to sign-in on 401 from the API", async () => {
    const { api, onAuthLost } = setup(() => ({ status: 401, json: envelope("UNAUTHENTICATED", "Authentication required.") }));
    await expect(api.getIssue("x")).rejects.toMatchObject({ code: "UNAUTHENTICATED", message: SIGNED_OUT_TEXT });
    expect(onAuthLost).toHaveBeenCalled();
  });

  it("returns to sign-in when there is no token (AUTH_REQUIRED), without calling the API", async () => {
    const { api, onAuthLost, calls } = setup(
      () => ({ status: 200, json: {} }),
      async () => {
        throw new AstigApiError(401, "AUTH_REQUIRED", "Please sign in.");
      },
    );
    await expect(api.analyticsSummary()).rejects.toMatchObject({ code: "AUTH_REQUIRED" });
    expect(onAuthLost).toHaveBeenCalled();
    expect(calls).toHaveLength(0);
  });

  it("uploads an after photo: registers it, then PUTs the bytes with the signed type and no manual length", async () => {
    const upload = { method: "PUT", url: "https://bucket.test/put?sig=1", headers: { "content-type": "image/jpeg", "content-length": "4" }, expiresAt: "2026-10-04T01:00:00Z" };
    const { api, calls } = setup((c) =>
      c.url.host === "bucket.test" ? { status: 200 } : { status: 201, json: { created: true, evidence: {}, upload } },
    );
    const file = new Blob([new Uint8Array([0xff, 0xd8, 0xff, 0xd9])], { type: "image/jpeg" });
    await api.addResolutionPhoto("wo-9", { clientEvidenceId: "22222222-2222-4222-8222-222222222222", file, note: "Grate cleared" });
    expect(calls[0]!.url.pathname).toBe("/work-orders/wo-9/resolution-evidence");
    expect(calls[0]!.body).toEqual({ clientEvidenceId: "22222222-2222-4222-8222-222222222222", contentType: "image/jpeg", contentLengthBytes: 4, note: "Grate cleared" });
    expect(calls[1]!.method).toBe("PUT");
    expect(calls[1]!.url.href).toBe(upload.url);
    expect(calls[1]!.headers).toEqual({ "content-type": "image/jpeg" });
    expect(calls[1]!.body).toBe(file);
  });

  it("does not upload again when the server says the photo is already stored (upload: null)", async () => {
    const { api, calls } = setup(() => ({ status: 200, json: { created: false, evidence: {}, upload: null } }));
    await api.addResolutionPhoto("wo-9", { clientEvidenceId: "22222222-2222-4222-8222-222222222222", file: new Blob(["x"]) });
    expect(calls).toHaveLength(1);
  });

  it("reports a rejected upload as an error", async () => {
    const upload = { method: "PUT", url: "https://bucket.test/put", headers: { "content-type": "image/jpeg", "content-length": "1" }, expiresAt: "2026-10-04T01:00:00Z" };
    const { api } = setup((c) => (c.url.host === "bucket.test" ? { status: 403 } : { status: 201, json: { created: true, evidence: {}, upload } }));
    await expect(api.addResolutionPhoto("wo-9", { clientEvidenceId: "33333333-3333-4333-8333-333333333333", file: new Blob(["x"]) })).rejects.toBeInstanceOf(ApiError);
  });

  it("reads the analytics summary", async () => {
    const { api, calls } = setup(() => ({ status: 200, json: { includesSynthetic: true } }));
    await expect(api.analyticsSummary()).resolves.toMatchObject({ includesSynthetic: true });
    expect(calls[0]!.url.pathname).toBe("/analytics/summary");
  });
});
