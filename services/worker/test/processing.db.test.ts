import pg from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { registerObservation } from "@astig/database";
import { evidenceObjectKey } from "@astig/domain";
import { SEED, SEED_ISSUES } from "../../../database/seeds/synthetic-demo";
import { resetAndSeed, testDatabaseUrl } from "../../../database/test/helpers";
import { beginProcessing, completeProcessing, STALE_PROCESSING_MS } from "../src";

const client = new pg.Client({ connectionString: testDatabaseUrl() });
const SESSION = "5e3d0003-0000-4000-8000-0000000000bb";
const I1 = SEED_ISSUES[0]!; // OPEN BLOCKED_DRAIN at 14.65275, 121.04756 with 3 observations

const detection = (over: Record<string, unknown> = {}) => ({
  schemaVersion: "detection.v0" as const,
  infrastructureVisible: true,
  issueType: "BLOCKED_DRAIN" as const,
  obstructionType: "GARBAGE" as const,
  blockagePercent: 80,
  severityEstimate: "CRITICAL" as const,
  confidence: 0.9,
  evidenceDescription: "SYNTHETIC test detection",
  requiresHumanReview: true,
  modelVersion: "fake-1",
  ...over,
});

async function tx<T>(fn: () => Promise<T>): Promise<T> {
  await client.query("BEGIN");
  try {
    const r = await fn();
    await client.query("COMMIT");
    return r;
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  }
}

let n = 0;
async function newObservation(lat: number, lon: number): Promise<string> {
  n++;
  const clientObservationId = `5e3d0005-0000-4000-8000-${(0xb00 + n).toString(16).padStart(12, "0")}`;
  await registerObservation(client, {
    sessionId: SESSION,
    actorSubject: SEED.operatorSubject,
    capture: {
      schemaVersion: "observation-capture.v0",
      clientObservationId,
      sequenceNumber: n,
      capturedAt: `2026-10-03T02:00:${String(n).padStart(2, "0")}.000Z`,
      location: { latitude: lat, longitude: lon },
      horizontalAccuracyM: 6,
      samplingMethod: "GPS_DISTANCE",
      distanceFromPreviousM: 7,
    },
  });
  return evidenceObjectKey(SESSION, clientObservationId);
}

beforeAll(() => client.connect());
afterAll(() => client.end());
beforeEach(async () => {
  await resetAndSeed(client);
  await client.query(
    `INSERT INTO inspection_sessions (id, device_id, vehicle_id, operator_subject, status, started_at, start_latitude, start_longitude, is_synthetic)
     VALUES ($1, $2, $3, $4, 'ACTIVE', '2026-10-03T01:00:00Z', 14.65, 121.05, true)`,
    [SESSION, SEED.deviceId, SEED.vehicleId, SEED.operatorSubject],
  );
});

const status = async (key: string) =>
  (await client.query("SELECT processing_status, processing_attempts, processing_error_code, issue_id, image_uploaded_at FROM observations WHERE image_object_key = $1", [key])).rows[0];

describe("beginProcessing", () => {
  it("records the upload, claims the observation, and refuses a concurrent duplicate", async () => {
    const key = await newObservation(14.66, 121.06);
    expect(await tx(() => beginProcessing(client, key))).toMatchObject({ proceed: true });
    expect(await status(key)).toMatchObject({ processing_status: "PROCESSING", processing_attempts: 1 });
    expect((await status(key)).image_uploaded_at).not.toBeNull();
    expect(await tx(() => beginProcessing(client, key))).toEqual({ proceed: false, reason: "IN_PROGRESS" });
  });

  it("retakes an abandoned PROCESSING row and retries FAILED rows", async () => {
    const key = await newObservation(14.66, 121.06);
    await tx(() => beginProcessing(client, key));
    const later = new Date(Date.now() + STALE_PROCESSING_MS + 1000);
    expect(await tx(() => beginProcessing(client, key, later))).toMatchObject({ proceed: true });
    await tx(() => completeProcessing(client, key, { kind: "FAILURE", code: "PROVIDER_TIMEOUT", message: "t" }));
    expect(await tx(() => beginProcessing(client, key, new Date(later.getTime() + 1)))).toMatchObject({ proceed: true });
    expect(await status(key)).toMatchObject({ processing_status: "PROCESSING", processing_attempts: 3, processing_error_code: null });
  });

  it("returns UNKNOWN_OBJECT for keys without a registered observation", async () => {
    expect(await tx(() => beginProcessing(client, evidenceObjectKey(SESSION, "5e3d0005-0000-4000-8000-0000000fffff")))).toEqual({ proceed: false, reason: "UNKNOWN_OBJECT" });
  });
});

describe("completeProcessing", () => {
  it("stores an explicit failure without a detection", async () => {
    const key = await newObservation(14.66, 121.06);
    await tx(() => beginProcessing(client, key));
    const r = await tx(() => completeProcessing(client, key, { kind: "FAILURE", code: "PROVIDER_NOT_CONFIGURED", message: "none" }));
    expect(r).toMatchObject({ applied: true, status: "FAILED", issueId: null });
    expect(await status(key)).toMatchObject({ processing_status: "FAILED", processing_error_code: "PROVIDER_NOT_CONFIGURED" });
    const d = await client.query("SELECT count(*)::int AS n FROM detections d JOIN observations o ON o.id = d.observation_id WHERE o.image_object_key = $1", [key]);
    expect(d.rows[0].n).toBe(0);
  });

  it("joins a nearby OPEN issue of the same type and appends a new versioned score", async () => {
    const key = await newObservation(14.65277, 121.04758); // ~3 m from I1
    await tx(() => beginProcessing(client, key));
    const r = await tx(() => completeProcessing(client, key, { kind: "DETECTION", detection: detection() }));
    expect(r).toMatchObject({ applied: true, status: "COMPLETED", issueId: I1.id });
    const latest = await client.query(
      "SELECT total_score, known_cap_total, formula_version FROM risk_assessments WHERE issue_id = $1 ORDER BY computed_at DESC LIMIT 1",
      [I1.id],
    );
    // CRITICAL (100 → 35) + 4 observations (75 → 15); weather/hazard/exposure UNKNOWN
    expect(latest.rows[0]).toEqual({ total_score: "50.00", known_cap_total: "55.00", formula_version: "risk.v0" });
  });

  it("creates a new issue when no same-type issue is within the radius", async () => {
    const far = await newObservation(14.66, 121.06);
    await tx(() => beginProcessing(client, far));
    const r1 = await tx(() => completeProcessing(client, far, { kind: "DETECTION", detection: detection() }));
    expect(r1.applied && r1.issueId).not.toBe(I1.id);

    // Same spot as I1 but a different type → separate issue (no cross-type merging).
    const other = await newObservation(14.65275, 121.04756);
    await tx(() => beginProcessing(client, other));
    const r2 = await tx(() => completeProcessing(client, other, { kind: "DETECTION", detection: detection({ issueType: "ROAD_DAMAGE", obstructionType: "NONE", blockagePercent: null }) }));
    expect(r2.applied && r2.issueId).not.toBe(I1.id);
    const issue = await client.query("SELECT issue_type, is_synthetic, location_uncertainty_m FROM issues WHERE id = $1", [r2.applied ? r2.issueId : null]);
    expect(issue.rows[0]).toEqual({ issue_type: "ROAD_DAMAGE", is_synthetic: true, location_uncertainty_m: 6 });
  });

  it("completes 'no issue' detections without creating an issue", async () => {
    const key = await newObservation(14.66, 121.06);
    await tx(() => beginProcessing(client, key));
    const r = await tx(() =>
      completeProcessing(client, key, { kind: "DETECTION", detection: detection({ infrastructureVisible: false, issueType: "NONE", obstructionType: "NONE", blockagePercent: null, severityEstimate: "NONE" }) }),
    );
    expect(r).toMatchObject({ applied: true, status: "COMPLETED", issueId: null });
  });

  it("is idempotent: a duplicate completion is not applied and a COMPLETED row is never reprocessed", async () => {
    const key = await newObservation(14.66, 121.06);
    await tx(() => beginProcessing(client, key));
    await tx(() => completeProcessing(client, key, { kind: "DETECTION", detection: detection() }));
    expect(await tx(() => completeProcessing(client, key, { kind: "DETECTION", detection: detection() }))).toEqual({ applied: false, reason: "NOT_PROCESSING" });
    expect(await tx(() => beginProcessing(client, key))).toEqual({ proceed: false, reason: "ALREADY_COMPLETED" });
    const d = await client.query("SELECT count(*)::int AS n FROM detections d JOIN observations o ON o.id = d.observation_id WHERE o.image_object_key = $1", [key]);
    expect(d.rows[0].n).toBe(1);
  });

  it("re-validates detections and records invalid ones as FAILED", async () => {
    const key = await newObservation(14.66, 121.06);
    await tx(() => beginProcessing(client, key));
    const bad = detection({ confidence: 3 }) as never;
    const r = await tx(() => completeProcessing(client, key, { kind: "DETECTION", detection: bad }));
    expect(r).toMatchObject({ applied: true, status: "FAILED" });
    expect(await status(key)).toMatchObject({ processing_error_code: "INVALID_MODEL_OUTPUT" });
  });
});
