import pg from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { resetDemo, seed } from "../scripts/seed-lib";
import { SEED, SEED_ISSUES, SEED_WORK_ORDERS } from "../seeds/synthetic-demo";
import { resetAndSeed, testDatabaseUrl } from "./helpers";

const client = new pg.Client({ connectionString: testDatabaseUrl() });
const [I1, , I3] = SEED_ISSUES.map((i) => i.id) as [string, string, string];
const quiet = () => undefined;

beforeAll(() => client.connect());
afterAll(() => client.end());
beforeEach(() => resetAndSeed(client));

async function rehearse() {
  // An officer creates a work order on I1 and resolves it; an extra live device exists.
  await client.query("INSERT INTO devices (id, label, is_synthetic) VALUES ('0c0ffee0-0000-4000-8000-00000000d001', 'Team phone 1', false)");
  const wo = await client.query(
    `INSERT INTO work_orders (issue_id, risk_assessment_id, idempotency_key, idempotency_fingerprint, created_by_subject)
     VALUES ($1, $2, gen_random_uuid(), repeat('a', 64), 'demo-officer') RETURNING id`,
    [I1, SEED_ISSUES[0]!.riskAssessmentId],
  );
  await client.query("UPDATE work_orders SET status = 'IN_PROGRESS', started_at = now() WHERE id = $1", [wo.rows[0].id]);
  await client.query("UPDATE work_orders SET status = 'RESOLVED', resolved_at = now() WHERE id = $1", [wo.rows[0].id]);
  await client.query("UPDATE issues SET status = 'RESOLVED' WHERE id = $1", [I1]);
  await client.query(
    `INSERT INTO resolution_evidence (work_order_id, client_evidence_id, idempotency_fingerprint, image_object_key, content_length_bytes, created_by_subject)
     VALUES ($1, gen_random_uuid(), repeat('b', 64), 'work-orders/x/resolution/y.jpg', 10, 'demo-officer')`,
    [wo.rows[0].id],
  );
}

const snapshot = async () =>
  (await client.query(
    `SELECT (SELECT count(*) FROM work_orders)::int AS wos, (SELECT count(*) FROM resolution_evidence)::int AS evidence,
            (SELECT count(*) FROM observations)::int AS obs, (SELECT count(*) FROM devices)::int AS devices,
            (SELECT status FROM issues WHERE id = $1) AS i1, (SELECT status FROM issues WHERE id = $2) AS i3`,
    [I1, I3],
  )).rows[0];

describe("resetDemo", () => {
  it("WORK_ORDERS restores seed work orders and issue states but keeps captures and devices", async () => {
    await client.query(
      `INSERT INTO inspection_sessions (id, device_id, vehicle_id, operator_subject, status, started_at, start_latitude, start_longitude, is_synthetic)
       VALUES ('0c0ffee0-0000-4000-8000-00000000a001', $1, $2, 'op', 'ACTIVE', now(), 14.6, 121, true)`,
      [SEED.deviceId, SEED.vehicleId],
    );
    await rehearse();
    const r = await resetDemo(client, "WORK_ORDERS", quiet);
    expect(r).toMatchObject({ workOrdersDeleted: 3, issuesReopened: 2 });
    expect(await snapshot()).toEqual({ wos: SEED_WORK_ORDERS.length, evidence: 0, obs: 7, devices: 2, i1: "OPEN", i3: "RESOLVED" });
    const sessions = await client.query("SELECT count(*)::int AS n FROM inspection_sessions");
    expect(sessions.rows[0].n).toBe(3);
    // Rehearsal can be repeated.
    await rehearse().catch(() => undefined);
    await resetDemo(client, "WORK_ORDERS", quiet);
    expect((await snapshot()).wos).toBe(SEED_WORK_ORDERS.length);
  });

  it("ALL wipes operational data and re-seeds, keeping devices", async () => {
    await rehearse();
    await resetDemo(client, "ALL", quiet);
    expect(await snapshot()).toEqual({ wos: SEED_WORK_ORDERS.length, evidence: 0, obs: 7, devices: 2, i1: "OPEN", i3: "RESOLVED" });
    expect(await seed(client, quiet)).toBe(false); // seed is present
  });
});
