import ncrCities from "../seeds/ncr-cities.json";
import { loadAreas, type AreaInput } from "../src/areas";
import { purgeDeviceData } from "../src/purge";
import { createPoolFromEnv } from "../src/pool";
import { migrate } from "../scripts/migrate-lib";
import { DEMO_RESET_CONFIRMATION, resetDemo, seed, type DemoResetScope } from "../scripts/seed-lib";

/**
 * Admin Lambda (inside the VPC). The private database is unreachable from laptops, so schema and
 * demo-data operations run here, invoked explicitly by the AWS owner:
 *   aws lambda invoke --function-name <AdminFunctionName> --payload fileb://payload.json out.json
 * `reset-demo` is the only destructive action: demo rehearsal only, and it requires the exact
 * confirmation phrase so it cannot be triggered by a typo.
 */
type AdminEvent =
  | { action: "migrate" }
  | { action: "seed" }
  | { action: "status" }
  | { action: "register-device" | "register-vehicle"; label: string; isSynthetic?: boolean }
  | { action: "load-ncr-cities" }
  | { action: "reset-demo"; scope?: DemoResetScope; confirm: string }
  | { action: "list-devices" }
  | { action: "purge-device-data"; deviceId: string; confirm: string }
  | { action: "load-areas"; source: string; areas: AreaInput[] };

const LABEL = /^[A-Za-z0-9 ()._-]{1,120}$/;

export async function handler(event: AdminEvent) {
  const pool = await createPoolFromEnv({ max: 1 });
  const client = await pool.connect();
  const log: string[] = [];
  try {
    switch (event?.action) {
      case "migrate":
        return { applied: await migrate(client, (m) => log.push(m)), log };
      case "seed":
        return { seeded: await seed(client, (m) => log.push(m)), log };
      case "status": {
        const { rows } = await client.query(
          `SELECT (SELECT coalesce(json_agg(version ORDER BY version), '[]') FROM schema_migrations) AS migrations,
                  (SELECT count(*) FROM issues)::int AS issues,
                  (SELECT coalesce(json_object_agg(processing_status, n), '{}') FROM
                     (SELECT processing_status, count(*)::int AS n FROM observations GROUP BY 1) s) AS observations,
                  (SELECT count(*) FROM work_orders)::int AS work_orders,
                  (SELECT count(*) FROM admin_areas)::int AS admin_areas,
                  (SELECT postgis_lib_version()) AS postgis`,
        );
        return rows[0];
      }
      case "register-device":
      case "register-vehicle": {
        // Labels are equipment names (e.g. "Dashcam replay rig (demo)"), never personal names.
        if (!LABEL.test(event.label ?? "")) throw new Error("label must be 1-120 chars of letters, digits, space, ( ) . _ -");
        const table = event.action === "register-device" ? "devices" : "vehicles";
        const isSynthetic = event.isSynthetic === true;
        const { rows } = await client.query(
          `INSERT INTO ${table} (id, label, is_synthetic) VALUES (gen_random_uuid(), $1, $2) RETURNING id`,
          [event.label, isSynthetic],
        );
        return { id: rows[0].id, label: event.label, isSynthetic };
      }
      case "list-devices": {
        const { rows } = await client.query(
          `SELECT d.id, d.label, d.is_synthetic, count(DISTINCT s.id)::int AS sessions, count(o.id)::int AS observations
             FROM devices d LEFT JOIN inspection_sessions s ON s.device_id = d.id LEFT JOIN observations o ON o.session_id = s.id
            GROUP BY d.id ORDER BY d.label`,
        );
        return rows;
      }
      case "purge-device-data": {
        if (event.confirm !== DEMO_RESET_CONFIRMATION) throw new Error(`purge-device-data requires "confirm": "${DEMO_RESET_CONFIRMATION}"`);
        if (!/^[0-9a-f-]{36}$/.test(event.deviceId ?? "")) throw new Error("deviceId must be a UUID");
        await client.query("BEGIN");
        try {
          const result = await purgeDeviceData(client, event.deviceId);
          await client.query("COMMIT");
          return { ...result, next: "invoke the analytics export, then refresh QuickSight" };
        } catch (err) {
          await client.query("ROLLBACK");
          throw err;
        }
      }
      case "reset-demo": {
        if (event.confirm !== DEMO_RESET_CONFIRMATION) throw new Error(`reset-demo requires "confirm": "${DEMO_RESET_CONFIRMATION}"`);
        const scope = event.scope ?? "WORK_ORDERS";
        if (scope !== "WORK_ORDERS" && scope !== "ALL") throw new Error("scope must be WORK_ORDERS or ALL");
        return { ...(await resetDemo(client, scope, (m) => log.push(m))), log, next: "invoke the analytics export, then refresh QuickSight" };
      }
      case "load-ncr-cities": {
        // Bundled, attributed OSM boundaries for the 17 NCR cities/municipality.
        await client.query("BEGIN");
        try {
          const result = await loadAreas(client, ncrCities.source, ncrCities.areas as AreaInput[]);
          await client.query("COMMIT");
          return result;
        } catch (err) {
          await client.query("ROLLBACK");
          throw err;
        }
      }
      case "load-areas": {
        await client.query("BEGIN");
        try {
          const result = await loadAreas(client, event.source, event.areas);
          await client.query("COMMIT");
          return result;
        } catch (err) {
          await client.query("ROLLBACK");
          throw err;
        }
      }
      default:
        throw new Error("action must be one of: migrate, seed, status, register-device, register-vehicle, load-ncr-cities, load-areas, reset-demo");
    }
  } finally {
    client.release();
    await pool.end();
  }
}
