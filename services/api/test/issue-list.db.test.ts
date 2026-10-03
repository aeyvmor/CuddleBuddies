import { AnalyticsSummaryResponse, IssueListResponse } from "@astig/contracts";
import pg from "pg";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { SEED_ISSUES } from "../../../database/seeds/synthetic-demo";
import { resetAndSeed, testDatabaseUrl } from "../../../database/test/helpers";
import { createApp } from "../src/app";

const pool = new pg.Pool({ connectionString: testDatabaseUrl(), max: 4 });
const officer = { "x-astig-dev-subject": "demo-officer-01", "x-astig-dev-roles": "OFFICER" };
const app = createApp({ pool, authMode: "local-dev", evidenceSigner: null, log: () => undefined });
const [I1, I2, I3] = SEED_ISSUES.map((i) => i.id) as [string, string, string];

const get = async (path: string, query: Record<string, string> = {}, headers: Record<string, string> = officer) => {
  const res = await app({ method: "GET", path, query, headers, body: null, requestId: "t" });
  return { status: res.statusCode, body: JSON.parse(res.body) };
};

beforeEach(async () => {
  const c = await pool.connect();
  try {
    await resetAndSeed(c);
  } finally {
    c.release();
  }
});
afterAll(() => pool.end());

describe("GET /issues", () => {
  it("lists contract-valid items sorted by score, with derived severity and work-order status", async () => {
    const r = await get("/issues");
    expect(r.status).toBe(200);
    const body = IssueListResponse.parse(r.body);
    expect(body.items.map((i) => [i.issue.id, i.totalScore, i.severity, i.workOrderStatus])).toEqual([
      [I1, 42.25, "HIGH", null],
      [I2, 17.5, "MODERATE", "OPEN"],
      [I3, 8.75, "LOW", "RESOLVED"],
    ]);
    expect(body.items[0]!.issue).toMatchObject({ observationCount: 3, isSynthetic: true });
    expect(body.areaNames).toEqual(["Demo Area A (synthetic)"]);
    expect(body.nextCursor).toBeNull();
  });

  it.each([
    [{ issueType: "BLOCKED_DRAIN" }, [I1]],
    [{ severity: "MODERATE" }, [I2]],
    [{ workOrderStatus: "NONE" }, [I1]],
    [{ workOrderStatus: "RESOLVED" }, [I3]],
    [{ status: "OPEN" }, [I1, I2]],
    [{ areaName: "Nowhere" }, []],
    // Tight box around I1 only (lon 121.0475, lat 14.6527)
    [{ bbox: "121.047,14.652,121.048,14.653" }, [I1]],
  ])("filters %j", async (query, expected) => {
    const r = await get("/issues", query as Record<string, string>);
    expect(r.status).toBe(200);
    expect(r.body.items.map((i: any) => i.issue.id)).toEqual(expected);
  });

  it("paginates with an opaque cursor", async () => {
    const p1 = await get("/issues", { limit: "2" });
    expect(p1.body.items).toHaveLength(2);
    expect(p1.body.nextCursor).toBeTypeOf("string");
    const p2 = await get("/issues", { limit: "2", cursor: p1.body.nextCursor });
    expect(p2.body.items.map((i: any) => i.issue.id)).toEqual([I3]);
    expect(p2.body.nextCursor).toBeNull();
  });

  it.each([
    [{ bbox: "121.05,14.6,121.04,14.7" }],
    [{ bbox: "200,0,201,1" }],
    [{ bbox: "1,2,3" }],
    [{ limit: "0" }],
    [{ limit: "500" }],
    [{ severity: "EXTREME" }],
    [{ cursor: "!!" }],
    [{ unexpected: "x" }],
  ])("rejects invalid query %j", async (query) => {
    const r = await get("/issues", query as Record<string, string>);
    expect(r.status).toBe(400);
    expect(r.body.error.code).toBe("VALIDATION_FAILED");
  });

  it("requires the OFFICER role", async () => {
    expect((await get("/issues", {}, { "x-astig-dev-subject": "op", "x-astig-dev-roles": "OPERATOR" })).status).toBe(403);
  });
});

describe("GET /analytics/summary", () => {
  it("reports seed metrics and flags synthetic data", async () => {
    const r = await get("/analytics/summary");
    expect(r.status).toBe(200);
    const s = AnalyticsSummaryResponse.parse(r.body);
    expect(s.includesSynthetic).toBe(true);
    expect(s.issues).toMatchObject({ total: 3, open: 2, resolved: 1 });
    expect(s.issues.byType).toEqual([
      { issueType: "BLOCKED_DRAIN", count: 1 },
      { issueType: "ROAD_DAMAGE", count: 1 },
      { issueType: "STANDING_WATER", count: 1 },
    ]);
    expect(s.workOrders).toEqual({ open: 1, inProgress: 0, resolved: 1, meanResolutionHours: 51 });
    expect(s.recurrence).toEqual({ repeatIssues: 1, meanObservationsPerIssue: 1.67 });
    expect(s.coverage).toMatchObject({ sessions: 2, observations: 7 });
    expect(s.coverage.capturedDistanceM).toBeCloseTo(50.5, 5);
    expect(s.processing).toEqual([
      { status: "COMPLETED", count: 5 },
      { status: "FAILED", count: 1 },
      { status: "PENDING", count: 1 },
    ]);
  });
});
