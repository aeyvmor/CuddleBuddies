import { IssueDetailResponse } from "@astig/contracts";
import pg from "pg";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { SEED_ISSUES } from "../../../database/seeds/synthetic-demo";
import { resetAndSeed, testDatabaseUrl } from "../../../database/test/helpers";
import { createApp } from "../src/app";
import type { EvidenceUrlSigner } from "../src/evidence";
import type { ApiRequest } from "../src/http";

const pool = new pg.Pool({ connectionString: testDatabaseUrl(), max: 4 });
const [I1, I2, I3] = SEED_ISSUES as [(typeof SEED_ISSUES)[0], (typeof SEED_ISSUES)[0], (typeof SEED_ISSUES)[0]];
const WO_OPEN = "5e3d0008-0000-4000-8000-000000000001"; // I2
const WO_RESOLVED = "5e3d0008-0000-4000-8000-000000000002"; // I3
const KEY_A = "0b6f1d4e-6a3c-4c1e-9d2a-7f00000000a1";
const KEY_B = "0b6f1d4e-6a3c-4c1e-9d2a-7f00000000b2";

const officer = { "x-astig-dev-subject": "demo-officer-01", "x-astig-dev-roles": "OFFICER" };
const app = createApp({ pool, authMode: "local-dev", evidenceSigner: null, log: () => undefined });

const call = async (handler: typeof app, method: string, path: string, body?: unknown) => {
  const r: ApiRequest = { method, path, headers: officer, body: body === undefined ? null : JSON.stringify(body), requestId: "t" };
  const res = await handler(r);
  return { status: res.statusCode, body: JSON.parse(res.body) };
};
const api = (method: string, path: string, body?: unknown) => call(app, method, path, body);

beforeEach(async () => {
  const c = await pool.connect();
  try {
    await resetAndSeed(c);
  } finally {
    c.release();
  }
});
afterAll(() => pool.end());

describe("GET /issues/{id}", () => {
  it("returns contract-valid detail with versioned score breakdown and evidence history", async () => {
    const res = await api("GET", `/issues/${I1.id}`);
    expect(res.status).toBe(200);
    const detail = IssueDetailResponse.parse(res.body);
    expect(detail.issue).toMatchObject({ id: I1.id, status: "OPEN", observationCount: 3, isSynthetic: true });
    expect(detail.riskAssessment).toMatchObject({ formulaVersion: "risk.v0", totalScore: 42.25, knownCapTotal: 65 });
    expect(detail.riskAssessment!.components.map((c) => [c.factor, c.inputStatus, c.weightedPoints])).toEqual([
      ["SEVERITY", "KNOWN", 26.25],
      ["WEATHER", "UNKNOWN", null],
      ["RECURRENCE", "KNOWN", 10],
      ["HAZARD", "UNKNOWN", null],
      ["EXPOSURE", "KNOWN", 6],
    ]);
    expect(detail.observations.map((o) => o.capturedAt)).toEqual([
      "2026-10-01T00:38:42.000Z",
      "2026-10-01T00:38:40.000Z",
      "2026-09-28T00:41:10.000Z",
    ]);
    expect(detail.observations[0]!.detection).toMatchObject({ severityEstimate: "HIGH", confidence: 0.79, requiresHumanReview: true });
    expect(detail.observations[0]!.evidence).toEqual({ status: "UNAVAILABLE", reason: "SIGNER_NOT_CONFIGURED" });
    expect(detail.observationsTruncated).toBe(false);
    expect(detail.workOrders).toEqual([]);
  });

  it("never exposes object keys; uses the signer for short-lived URLs when configured", async () => {
    const signer: EvidenceUrlSigner = {
      sign: async (key) => ({ url: `https://signed.example.test/${encodeURIComponent(key.length.toString())}?sig=x`, expiresAt: "2026-10-03T01:05:00.000Z" }),
    };
    const signed = createApp({ pool, authMode: "local-dev", evidenceSigner: signer, log: () => undefined });
    const res = await call(signed, "GET", `/issues/${I1.id}`);
    expect(res.body.observations[0].evidence.status).toBe("AVAILABLE");
    expect(JSON.stringify(res.body)).not.toContain("sessions/");
  });

  it("includes existing work orders and returns 404 for an unknown issue", async () => {
    const res = await api("GET", `/issues/${I3.id}`);
    expect(res.body.issue.status).toBe("RESOLVED");
    expect(res.body.workOrders[0]).toMatchObject({ id: WO_RESOLVED, status: "RESOLVED" });
    const missing = await api("GET", "/issues/5e3d0004-0000-4000-8000-0000000000ff");
    expect(missing.status).toBe(404);
    expect(missing.body.error.code).toBe("NOT_FOUND");
  });
});

describe("POST /issues/{id}/work-orders", () => {
  const body = { idempotencyKey: KEY_A, riskAssessmentId: I1.riskAssessmentId, assignedTeam: "Synthetic Drainage Team" };

  it("creates an OPEN work order (officer approval) and replays idempotently", async () => {
    const first = await api("POST", `/issues/${I1.id}/work-orders`, body);
    expect(first.status).toBe(201);
    expect(first.body).toMatchObject({ created: true, workOrder: { status: "OPEN", createdBySubject: "demo-officer-01", version: 1, startedAt: null } });
    const replay = await api("POST", `/issues/${I1.id}/work-orders`, body);
    expect(replay.status).toBe(200);
    expect(replay.body.created).toBe(false);
    expect(replay.body.workOrder.id).toBe(first.body.workOrder.id);
  });

  it("serializes concurrent duplicate creates into one work order", async () => {
    const results = await Promise.all([1, 2, 3].map(() => api("POST", `/issues/${I1.id}/work-orders`, body)));
    expect(results.map((r) => r.status).sort()).toEqual([200, 200, 201]);
    expect(new Set(results.map((r) => r.body.workOrder.id)).size).toBe(1);
  });

  it("rejects key reuse with a different body", async () => {
    await api("POST", `/issues/${I1.id}/work-orders`, body);
    const res = await api("POST", `/issues/${I1.id}/work-orders`, { ...body, notes: "changed" });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("IDEMPOTENCY_CONFLICT");
  });

  it("rejects a second active work order for the same issue", async () => {
    const res = await api("POST", `/issues/${I2.id}/work-orders`, { idempotencyKey: KEY_B, riskAssessmentId: I2.riskAssessmentId });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("ACTIVE_WORK_ORDER_EXISTS");
  });

  it("rejects a risk assessment from another issue, and resolved issues", async () => {
    const mismatch = await api("POST", `/issues/${I1.id}/work-orders`, { idempotencyKey: KEY_B, riskAssessmentId: I2.riskAssessmentId });
    expect(mismatch.body.error.code).toBe("RISK_ASSESSMENT_MISMATCH");
    const resolved = await api("POST", `/issues/${I3.id}/work-orders`, { idempotencyKey: KEY_B, riskAssessmentId: I3.riskAssessmentId });
    expect(resolved.status).toBe(409);
    expect(resolved.body.error.code).toBe("ISSUE_NOT_OPEN");
  });

  it("returns 404 for an unknown issue", async () => {
    const res = await api("POST", "/issues/5e3d0004-0000-4000-8000-0000000000ff/work-orders", body);
    expect(res.status).toBe(404);
  });
});

describe("PATCH /work-orders/{id}", () => {
  it("moves OPEN → IN_PROGRESS → RESOLVED, resolves the issue, and records audit events", async () => {
    const started = await api("PATCH", `/work-orders/${WO_OPEN}`, { status: "IN_PROGRESS" });
    expect(started.status).toBe(200);
    expect(started.body.workOrder).toMatchObject({ status: "IN_PROGRESS", version: 2 });
    expect(started.body.workOrder.startedAt).not.toBeNull();

    const replay = await api("PATCH", `/work-orders/${WO_OPEN}`, { status: "IN_PROGRESS" });
    expect(replay.status).toBe(200);
    expect(replay.body.workOrder.version).toBe(2); // no-op, no version bump

    const resolved = await api("PATCH", `/work-orders/${WO_OPEN}`, { status: "RESOLVED", notes: "SYNTHETIC: cleared." });
    expect(resolved.body.workOrder).toMatchObject({ status: "RESOLVED", notes: "SYNTHETIC: cleared.", version: 3 });
    expect(resolved.body.workOrder.resolvedAt).not.toBeNull();

    const issue = await api("GET", `/issues/${I2.id}`);
    expect(issue.body.issue.status).toBe("RESOLVED");

    const events = await pool.query("SELECT event_type, from_status, to_status, changed_fields FROM work_order_events WHERE work_order_id = $1 ORDER BY id", [WO_OPEN]);
    expect(events.rows).toEqual([
      { event_type: "CREATED", from_status: null, to_status: "OPEN", changed_fields: [] },
      { event_type: "STATUS_CHANGED", from_status: "OPEN", to_status: "IN_PROGRESS", changed_fields: ["status"] },
      { event_type: "STATUS_CHANGED", from_status: "IN_PROGRESS", to_status: "RESOLVED", changed_fields: ["status", "notes"] },
    ]);
  });

  it("rejects skipping OPEN → RESOLVED with allowed next status", async () => {
    const res = await api("PATCH", `/work-orders/${WO_OPEN}`, { status: "RESOLVED" });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("INVALID_TRANSITION");
    expect(res.body.error.details).toEqual([{ path: "status", message: "allowed next status: IN_PROGRESS" }]);
  });

  it("rejects moving backwards", async () => {
    await api("PATCH", `/work-orders/${WO_OPEN}`, { status: "IN_PROGRESS" });
    const res = await api("PATCH", `/work-orders/${WO_OPEN}`, { status: "OPEN" });
    expect(res.body.error.code).toBe("INVALID_TRANSITION");
  });

  it("treats RESOLVED as closed but allows an idempotent resolve retry", async () => {
    const retry = await api("PATCH", `/work-orders/${WO_RESOLVED}`, { status: "RESOLVED" });
    expect(retry.status).toBe(200);
    const reopen = await api("PATCH", `/work-orders/${WO_RESOLVED}`, { status: "OPEN" });
    expect(reopen.body.error.code).toBe("WORK_ORDER_CLOSED");
    const edit = await api("PATCH", `/work-orders/${WO_RESOLVED}`, { notes: "late edit" });
    expect(edit.body.error.code).toBe("WORK_ORDER_CLOSED");
  });

  it("updates assignment/notes without a status change, and clears with null", async () => {
    const res = await api("PATCH", `/work-orders/${WO_OPEN}`, { assignedTeam: "Synthetic Team B", notes: null });
    expect(res.body.workOrder).toMatchObject({ status: "OPEN", assignedTeam: "Synthetic Team B", notes: null, version: 2 });
  });

  it("returns 404 for unknown work orders and 400 for empty patches", async () => {
    expect((await api("PATCH", "/work-orders/5e3d0008-0000-4000-8000-0000000000ff", { status: "IN_PROGRESS" })).status).toBe(404);
    expect((await api("PATCH", `/work-orders/${WO_OPEN}`, {})).status).toBe(400);
  });
});
