import pg from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import ncrCities from "../seeds/ncr-cities.json";
import { loadAreas, type AreaInput } from "../src/areas";
import { SEED, SEED_ISSUES } from "../seeds/synthetic-demo";
import { resetAndSeed, sqlState, testDatabaseUrl } from "./helpers";

const client = new pg.Client({ connectionString: testDatabaseUrl() });
const areas = ncrCities.areas as AreaInput[];

beforeAll(() => client.connect());
afterAll(() => client.end());
beforeEach(() => resetAndSeed(client));

const areaAt = async (lat: number, lon: number) =>
  (await client.query("SELECT astig_area_name_for($1, $2) AS name", [lat, lon])).rows[0].name;

describe("NCR boundary dataset", () => {
  it("is attributed and covers the 17 NCR LGUs", () => {
    expect(ncrCities.source).toMatch(/OpenStreetMap contributors.*ODbL/);
    expect(areas).toHaveLength(17);
    expect(new Set(areas.map((a) => a.id)).size).toBe(17);
  });

  it("loads valid geometry, resolves known points, and leaves outside points unknown", async () => {
    const r = await loadAreas(client, ncrCities.source, areas);
    expect(r.loaded).toBe(17);
    const invalid = await client.query("SELECT count(*)::int AS n FROM admin_areas WHERE NOT ST_IsValid(geom)");
    expect(invalid.rows[0].n).toBe(0);
    expect(await areaAt(14.5869, 120.9768)).toBe("Manila"); // Intramuros / Rizal Park
    expect(await areaAt(14.6537, 121.0499)).toBe("Quezon City"); // Quezon Memorial Circle
    expect(await areaAt(14.5547, 121.0244)).toBe("Makati"); // Ayala Avenue
    expect(await areaAt(10.3157, 123.8854)).toBeNull(); // Cebu: unknown, not guessed
  });

  it("tags only issues that have no area yet, and is idempotent", async () => {
    await client.query("UPDATE issues SET area_name = NULL WHERE id = $1", [SEED_ISSUES[0]!.id]);
    const first = await loadAreas(client, ncrCities.source, areas);
    expect(first.issuesTagged).toBe(1);
    const rows = await client.query("SELECT id, area_name FROM issues ORDER BY id");
    expect(rows.rows.find((r) => r.id === SEED_ISSUES[0]!.id)?.area_name).toBe("Quezon City");
    expect(rows.rows.filter((r) => r.area_name === "Demo Area A (synthetic)")).toHaveLength(2); // untouched
    expect((await loadAreas(client, ncrCities.source, areas)).issuesTagged).toBe(0);
    expect((await client.query("SELECT count(*)::int AS n FROM admin_areas")).rows[0].n).toBe(17);
  });

  it("rejects unattributed or malformed input", async () => {
    await expect(loadAreas(client, "", areas)).rejects.toThrow(/attribution/);
    await expect(loadAreas(client, "x", [{ ...areas[0]!, id: "Bad Id" }])).rejects.toThrow(/invalid area/);
  });
});

describe("DASHCAM_REPLAY sampling method", () => {
  it("is accepted by the database; unknown methods are not", async () => {
    const insert = (method: string) =>
      client.query(
        `INSERT INTO observations (session_id, client_observation_id, idempotency_fingerprint, schema_version, sequence_number,
           captured_at, latitude, longitude, sampling_method, image_object_key, is_synthetic)
         VALUES ('5e3d0003-0000-4000-8000-000000000001', gen_random_uuid(), repeat('a', 64), 'observation-capture.v0', 1,
           '2026-09-28T01:00:00Z', 14.6, 121.0, $1, 'k/' || gen_random_uuid(), true)`,
        [method],
      );
    await insert("DASHCAM_REPLAY");
    expect(await sqlState(() => insert("TIMER"))).toBe("23514");
    expect(SEED.deviceId).toBeTruthy();
  });
});
