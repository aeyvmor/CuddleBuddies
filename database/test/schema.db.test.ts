import pg from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { computeRiskScore, type RiskInputs } from "@astig/domain";
import { DataError, insertRiskAssessment, registerObservation } from "../src";
import { migrate } from "../scripts/migrate-lib";
import { seed } from "../scripts/seed-lib";
import { SEED, SEED_ISSUES, SEED_OBSERVATIONS } from "../seeds/synthetic-demo";
import { resetAndSeed, sqlState, testDatabaseUrl } from "./helpers";

const client = new pg.Client({ connectionString: testDatabaseUrl() });
const [I1, I2, I3] = SEED_ISSUES.map((i) => i.id) as [string, string, string];
const ACTIVE_SESSION = "5e3d0003-0000-4000-8000-0000000000aa";

const capture = (overrides: Record<string, unknown> = {}) => ({
  schemaVersion: "observation-capture.v0",
  clientObservationId: "5e3d0005-0000-4000-8000-0000000000aa",
  sequenceNumber: 1,
  capturedAt: "2026-10-03T01:00:00.000Z",
  location: { latitude: 14.6527, longitude: 121.0475 },
  horizontalAccuracyM: 5,
  samplingMethod: "GPS_DISTANCE",
  distanceFromPreviousM: 7,
  ...overrides,
});

const allUnknown: RiskInputs = {
  SEVERITY: { status: "UNKNOWN", source: null, rationale: "x" },
  WEATHER: { status: "UNKNOWN", source: null, rationale: "x" },
  RECURRENCE: { status: "UNKNOWN", source: null, rationale: "x" },
  HAZARD: { status: "UNKNOWN", source: null, rationale: "x" },
  EXPOSURE: { status: "UNKNOWN", source: null, rationale: "x" },
};

async function inTx<T>(fn: () => Promise<T>): Promise<T> {
  await client.query("BEGIN");
  try {
    const r = await fn();
    await client.query("COMMIT");
    return r;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  }
}

beforeAll(() => client.connect());
afterAll(() => client.end());
beforeEach(async () => {
  await resetAndSeed(client);
  await client.query(
    `INSERT INTO inspection_sessions (id, device_id, vehicle_id, operator_subject, status, started_at, start_latitude, start_longitude, is_synthetic)
     VALUES ($1, $2, $3, $4, 'ACTIVE', '2026-10-03T00:30:00Z', 14.651, 121.045, true)`,
    [ACTIVE_SESSION, SEED.deviceId, SEED.vehicleId, SEED.operatorSubject],
  );
});

describe("migrations", () => {
  it("are recorded and re-running applies nothing", async () => {
    const { rows } = await client.query("SELECT version FROM schema_migrations ORDER BY version");
    expect(rows.map((r) => r.version)).toEqual(["0001", "0002", "0003", "0004"]);
    expect(await migrate(client, () => undefined)).toEqual([]);
  });

  it("refuse to run if an applied migration was edited", async () => {
    await client.query("UPDATE schema_migrations SET checksum = 'tampered' WHERE version = '0001'");
    try {
      await expect(migrate(client, () => undefined)).rejects.toThrow(/modified after being applied/);
    } finally {
      const { loadMigrations } = await import("../scripts/migrate-lib");
      const [m] = await loadMigrations();
      await client.query("UPDATE schema_migrations SET checksum = $1 WHERE version = '0001'", [m!.checksum]);
    }
  });

  it("enable PostGIS with SRID 4326 geometry", async () => {
    const { rows } = await client.query("SELECT ST_SRID(geom) AS srid, ST_X(geom) AS x, ST_Y(geom) AS y FROM issues WHERE id = $1", [I1]);
    expect(rows[0]).toEqual({ srid: 4326, x: 121.04756, y: 14.65275 });
  });
});

describe("synthetic seed", () => {
  it("is deterministic, fully labeled synthetic, and refuses to double-seed", async () => {
    const counts = await client.query(
      `SELECT (SELECT count(*) FROM issues)::int AS issues, (SELECT count(*) FROM observations WHERE session_id <> $1)::int AS observations,
              (SELECT count(*) FROM observations WHERE NOT is_synthetic)::int AS real_obs,
              (SELECT count(*) FROM issues WHERE NOT is_synthetic)::int AS real_issues`,
      [ACTIVE_SESSION],
    );
    expect(counts.rows[0]).toEqual({ issues: 3, observations: SEED_OBSERVATIONS.length, real_obs: 0, real_issues: 0 });
    const scores = await client.query("SELECT issue_id, total_score, known_cap_total FROM risk_assessments ORDER BY issue_id");
    expect(scores.rows).toEqual([
      { issue_id: I1, total_score: "42.25", known_cap_total: "65.00" },
      { issue_id: I2, total_score: "17.50", known_cap_total: "55.00" },
      { issue_id: I3, total_score: "8.75", known_cap_total: "55.00" },
    ]);
    expect(await seed(client, () => undefined)).toBe(false);
  });

  it("stores no image bytes, only server-derived object keys", async () => {
    const { rows } = await client.query("SELECT session_id, client_observation_id, image_object_key FROM observations LIMIT 1");
    const r = rows[0]!;
    expect(r.image_object_key).toBe(`sessions/${r.session_id}/observations/${r.client_observation_id}.jpg`);
    const bytea = await client.query("SELECT count(*)::int AS n FROM information_schema.columns WHERE table_schema = 'public' AND data_type = 'bytea'");
    expect(bytea.rows[0].n).toBe(0);
  });
});

describe("spatial queries", () => {
  it("finds issues within a metre radius and orders by nearest", async () => {
    const near = await client.query(
      `SELECT id FROM issues
        WHERE ST_DWithin(geom::geography, ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography, $3)`,
      [121.0476, 14.6528, 50],
    );
    expect(near.rows.map((r) => r.id)).toEqual([I1]);
    const nearest = await client.query(
      "SELECT id FROM issues ORDER BY geom <-> ST_SetSRID(ST_MakePoint($1, $2), 4326) LIMIT 1",
      [121.0512, 14.649],
    );
    expect(nearest.rows[0].id).toBe(I2);
  });
});

describe("coordinate constraints", () => {
  it.each([
    [91, 121],
    [-91, 121],
    [14.6, 181],
    [14.6, -181],
    [Number.NaN, 121],
    [Number.POSITIVE_INFINITY, 121],
  ])("rejects invalid coordinates lat=%s lon=%s at the database", async (lat, lon) => {
    const state = await sqlState(() =>
      client.query(
        `INSERT INTO issues (id, issue_type, latitude, longitude, first_observed_at, last_observed_at, is_synthetic)
         VALUES (gen_random_uuid(), 'OTHER', $1, $2, now(), now(), true)`,
        [lat, lon],
      ),
    );
    expect(state).toBe("23514"); // check_violation
  });
});

describe("registerObservation (idempotent writes)", () => {
  const actor = SEED.operatorSubject;

  it("creates once and returns the same row on an identical retry", async () => {
    const first = await registerObservation(client, { sessionId: ACTIVE_SESSION, actorSubject: actor, capture: capture() });
    const retry = await registerObservation(client, { sessionId: ACTIVE_SESSION, actorSubject: actor, capture: capture() });
    expect(first.created).toBe(true);
    expect(retry.created).toBe(false);
    expect(retry.observation.id).toBe(first.observation.id);
    expect(first.observation.imageObjectKey).toBe(`sessions/${ACTIVE_SESSION}/observations/5e3d0005-0000-4000-8000-0000000000aa.jpg`);
    expect(first.observation.processingStatus).toBe("PENDING");
    const n = await client.query("SELECT count(*)::int AS n FROM observations WHERE session_id = $1", [ACTIVE_SESSION]);
    expect(n.rows[0].n).toBe(1);
  });

  it("handles concurrent duplicate submissions without creating two rows", async () => {
    const pool = new pg.Pool({ connectionString: testDatabaseUrl(), max: 4 });
    try {
      const results = await Promise.all(
        Array.from({ length: 4 }, () => registerObservation(pool as unknown as pg.Client, { sessionId: ACTIVE_SESSION, actorSubject: actor, capture: capture() })),
      );
      expect(results.filter((r) => r.created)).toHaveLength(1);
      expect(new Set(results.map((r) => r.observation.id)).size).toBe(1);
    } finally {
      await pool.end();
    }
  });

  it("rejects reuse of the idempotency key with different metadata", async () => {
    await registerObservation(client, { sessionId: ACTIVE_SESSION, actorSubject: actor, capture: capture() });
    await expect(
      registerObservation(client, { sessionId: ACTIVE_SESSION, actorSubject: actor, capture: capture({ location: { latitude: 14.7, longitude: 121.0475 } }) }),
    ).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT" });
  });

  it("rejects invalid coordinates and client-supplied object keys without writing", async () => {
    await expect(
      registerObservation(client, { sessionId: ACTIVE_SESSION, actorSubject: actor, capture: capture({ location: { latitude: 95, longitude: 121 } }) }),
    ).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
    await expect(
      registerObservation(client, { sessionId: ACTIVE_SESSION, actorSubject: actor, capture: { ...capture(), imageObjectKey: "x/y.jpg" } }),
    ).rejects.toBeInstanceOf(DataError);
    const n = await client.query("SELECT count(*)::int AS n FROM observations WHERE session_id = $1", [ACTIVE_SESSION]);
    expect(n.rows[0].n).toBe(0);
  });

  it("only lets the session operator register, and rejects captures after the session ended", async () => {
    await expect(
      registerObservation(client, { sessionId: ACTIVE_SESSION, actorSubject: "someone-else", capture: capture() }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    const ended = "5e3d0003-0000-4000-8000-000000000001"; // seed session ended 2026-09-28T01:30Z
    await expect(
      registerObservation(client, { sessionId: ended, actorSubject: actor, capture: capture() }),
    ).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
    // Offline-queued capture taken before the end is still accepted.
    const queued = await registerObservation(client, {
      sessionId: ended,
      actorSubject: actor,
      capture: capture({ capturedAt: "2026-09-28T01:10:00.000Z" }),
    });
    expect(queued.created).toBe(true);
    await expect(
      registerObservation(client, { sessionId: "5e3d0003-0000-4000-8000-0000000000ff", actorSubject: actor, capture: capture() }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

describe("processing and detection constraints", () => {
  const obsId = SEED_OBSERVATIONS[6]!.id; // PENDING, no detection

  it("refuses COMPLETED without a validated detection (checked at commit)", async () => {
    const state = await sqlState(() =>
      inTx(() => client.query("UPDATE observations SET processing_status = 'COMPLETED' WHERE id = $1", [obsId])),
    );
    expect(state).toBe("23514");
  });

  it("requires an error code and message for FAILED", async () => {
    const state = await sqlState(() => client.query("UPDATE observations SET processing_status = 'FAILED' WHERE id = $1", [obsId]));
    expect(state).toBe("23514");
  });

  it("allows at most one detection per observation (duplicate worker delivery)", async () => {
    const completed = SEED_OBSERVATIONS[0]!.id;
    const state = await sqlState(() =>
      client.query(
        `INSERT INTO detections (observation_id, schema_version, infrastructure_visible, issue_type, obstruction_type,
           severity_estimate, confidence, evidence_description, requires_human_review, model_version)
         VALUES ($1, 'detection.v0', true, 'BLOCKED_DRAIN', 'GARBAGE', 'HIGH', 0.9, 'dup', true, 'stub')`,
        [completed],
      ),
    );
    expect(state).toBe("23505");
  });

  it("rejects confidence outside [0,1]", async () => {
    const state = await sqlState(() =>
      client.query(
        `INSERT INTO detections (observation_id, schema_version, infrastructure_visible, issue_type, obstruction_type,
           severity_estimate, confidence, evidence_description, requires_human_review, model_version)
         VALUES ($1, 'detection.v0', true, 'BLOCKED_DRAIN', 'GARBAGE', 'HIGH', 1.5, 'x', true, 'stub')`,
        [obsId],
      ),
    );
    expect(state).toBe("23514");
  });
});

describe("risk assessment constraints", () => {
  it("persists a domain-computed breakdown including unknown inputs", async () => {
    const id = await inTx(() => insertRiskAssessment(client, { issueId: I1, result: computeRiskScore(allUnknown) }));
    const { rows } = await client.query("SELECT count(*)::int AS n FROM risk_score_components WHERE risk_assessment_id = $1 AND input_status = 'UNKNOWN' AND weighted_points IS NULL", [id]);
    expect(rows[0].n).toBe(5);
  });

  it("rejects weighted points above the component cap", async () => {
    const state = await sqlState(() =>
      inTx(async () => {
        const { rows } = await client.query("INSERT INTO risk_assessments (issue_id, formula_version, total_score, known_cap_total) VALUES ($1, 'risk.v0', 40, 35) RETURNING id", [I1]);
        await client.query(
          "INSERT INTO risk_score_components VALUES ($1, 'SEVERITY', 0.35, 35, 'KNOWN', 100, 40, null, 'x')",
          [rows[0].id],
        );
      }),
    );
    expect(state).toBe("23514");
  });

  it("rejects caps summing above 100 and totals that do not match components (at commit)", async () => {
    // Each row is individually valid; only the commit-time trigger can see the cross-row violation.
    const attempt = async (total: number, knownCaps: number, rowsToInsert: [string, number, string, number | null][]) =>
      sqlState(() =>
        inTx(async () => {
          const { rows } = await client.query(
            "INSERT INTO risk_assessments (issue_id, formula_version, total_score, known_cap_total) VALUES ($1, 'test', $2, $3) RETURNING id",
            [I1, total, knownCaps],
          );
          for (const [factor, cap, status, points] of rowsToInsert) {
            await client.query("INSERT INTO risk_score_components VALUES ($1, $2, 0.5, $3, $4, $5, $6, null, 'x')", [
              rows[0].id, factor, cap, status, points === null ? null : 100, points,
            ]);
          }
        }),
      );
    // caps 60 + 50 = 110 > 100
    expect(await attempt(60, 60, [["SEVERITY", 60, "KNOWN", 60], ["WEATHER", 50, "UNKNOWN", null]])).toBe("23514");
    // stored total 50 but components sum to 60
    expect(await attempt(50, 60, [["SEVERITY", 35, "KNOWN", 35], ["WEATHER", 25, "KNOWN", 25]])).toBe("23514");
    // no components at all
    expect(await attempt(0, 0, [])).toBe("23514");
  });

  it("rejects an UNKNOWN component carrying a value (unknown is not zero)", async () => {
    const state = await sqlState(() =>
      inTx(async () => {
        const { rows } = await client.query("INSERT INTO risk_assessments (issue_id, formula_version, total_score, known_cap_total) VALUES ($1, 'risk.v0', 0, 0) RETURNING id", [I1]);
        await client.query("INSERT INTO risk_score_components VALUES ($1, 'WEATHER', 0.25, 25, 'UNKNOWN', 0, 0, null, 'x')", [rows[0].id]);
      }),
    );
    expect(state).toBe("23514");
  });
});

describe("work-order constraints (defence in depth)", () => {
  const WO_OPEN = "5e3d0008-0000-4000-8000-000000000001"; // issue I2
  const WO_RESOLVED = "5e3d0008-0000-4000-8000-000000000002"; // issue I3

  it("rejects skipping OPEN → RESOLVED at the database", async () => {
    const state = await sqlState(() =>
      client.query("UPDATE work_orders SET status = 'RESOLVED', started_at = now(), resolved_at = now() WHERE id = $1", [WO_OPEN]),
    );
    expect(state).toBe("23514");
  });

  it("treats RESOLVED work orders as immutable", async () => {
    const state = await sqlState(() => client.query("UPDATE work_orders SET notes = 'edit' WHERE id = $1", [WO_RESOLVED]));
    expect(state).toBe("23514");
  });

  it("allows only one active work order per issue", async () => {
    const state = await sqlState(() =>
      client.query(
        `INSERT INTO work_orders (issue_id, risk_assessment_id, idempotency_key, idempotency_fingerprint, created_by_subject)
         VALUES ($1, $2, gen_random_uuid(), repeat('a', 64), 'demo-officer-01')`,
        [I2, SEED_ISSUES[1]!.riskAssessmentId],
      ),
    );
    expect(state).toBe("23505");
  });

  it("rejects a risk assessment that belongs to a different issue", async () => {
    const state = await sqlState(() =>
      client.query(
        `INSERT INTO work_orders (issue_id, risk_assessment_id, idempotency_key, idempotency_fingerprint, created_by_subject)
         VALUES ($1, $2, gen_random_uuid(), repeat('a', 64), 'demo-officer-01')`,
        [I1, SEED_ISSUES[1]!.riskAssessmentId],
      ),
    );
    expect(state).toBe("23503"); // foreign_key_violation
  });

  it("references the seeded I3 issue as resolved", async () => {
    const { rows } = await client.query("SELECT status FROM issues WHERE id = $1", [I3]);
    expect(rows[0].status).toBe("RESOLVED");
  });
});
