import pg from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { purgeDeviceData } from "../src/purge";
import { SEED, SEED_ISSUES } from "../seeds/synthetic-demo";
import { resetAndSeed, testDatabaseUrl } from "./helpers";

const client = new pg.Client({ connectionString: testDatabaseUrl() });
const PHONE = "0c0ffee0-0000-4000-8000-00000000d001";
beforeAll(() => client.connect());
afterAll(() => client.end());
beforeEach(() => resetAndSeed(client));

async function phoneIssue() {
  await client.query("INSERT INTO devices (id, label, is_synthetic) VALUES ($1, 'Team phone 1', false)", [PHONE]);
  await client.query(
    `INSERT INTO inspection_sessions (id, device_id, vehicle_id, operator_subject, status, started_at, start_latitude, start_longitude, is_synthetic)
     VALUES ('0c0ffee0-0000-4000-8000-00000000a001', $1, $2, 'op', 'ACTIVE', now(), 14.5, 121.05, false)`,
    [PHONE, SEED.vehicleId],
  );
  await client.query(
    `INSERT INTO issues (id, issue_type, latitude, longitude, first_observed_at, last_observed_at, is_synthetic)
     VALUES ('0c0ffee0-0000-4000-8000-00000000b001', 'DAMAGED_DRAIN', 14.5, 121.05, now(), now(), false)`,
  );
  await client.query(
    `INSERT INTO observations (session_id, client_observation_id, idempotency_fingerprint, schema_version, sequence_number, captured_at,
       latitude, longitude, sampling_method, image_object_key, issue_id, is_synthetic)
     VALUES ('0c0ffee0-0000-4000-8000-00000000a001', gen_random_uuid(), repeat('a', 64), 'observation-capture.v0', 1, now(), 14.5, 121.05, 'MANUAL', 'k/phone1', '0c0ffee0-0000-4000-8000-00000000b001', false)`,
  );
}

describe("purgeDeviceData", () => {
  it("removes only the device's sessions, observations, and its own issues", async () => {
    await phoneIssue();
    await client.query("BEGIN");
    const r = await purgeDeviceData(client, PHONE);
    await client.query("COMMIT");
    expect(r).toEqual({ sessions: 1, observations: 1, issues: 1, workOrders: 0 });
    const left = await client.query("SELECT (SELECT count(*) FROM issues)::int AS issues, (SELECT count(*) FROM observations)::int AS obs");
    expect(left.rows[0]).toEqual({ issues: SEED_ISSUES.length, obs: 7 });
  });

  it("refuses when an issue also holds other devices' observations", async () => {
    await phoneIssue();
    await client.query("UPDATE observations SET issue_id = '0c0ffee0-0000-4000-8000-00000000b001' WHERE id = (SELECT id FROM observations WHERE session_id = '5e3d0003-0000-4000-8000-000000000001' LIMIT 1)");
    await client.query("BEGIN");
    await expect(purgeDeviceData(client, PHONE)).rejects.toThrow(/Refusing/);
    await client.query("ROLLBACK");
  });
});
