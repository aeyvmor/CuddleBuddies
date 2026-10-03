import { createPoolFromEnv } from "../src/pool";
import { migrate } from "../scripts/migrate-lib";
import { seed } from "../scripts/seed-lib";

/**
 * Admin Lambda (inside the VPC). The private database is unreachable from laptops, so schema and
 * demo-data operations run here, invoked explicitly by the AWS owner:
 *   aws lambda invoke --function-name <AdminFunctionName> --payload '{"action":"migrate"}' out.json
 * Destructive actions (reset/drop) are deliberately not offered.
 */
type AdminEvent =
  | { action: "migrate" }
  | { action: "seed" }
  | { action: "status" }
  | { action: "register-device"; label: string }
  | { action: "register-vehicle"; label: string };

const LABEL = /^[A-Za-z0-9 ._-]{1,120}$/;

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
                  (SELECT postgis_lib_version()) AS postgis`,
        );
        return rows[0];
      }
      case "register-device":
      case "register-vehicle": {
        // Labels are equipment names (e.g. "Team phone 1"), never personal names.
        if (!LABEL.test(event.label ?? "")) throw new Error("label must be 1-120 chars of letters, digits, space, . _ -");
        const table = event.action === "register-device" ? "devices" : "vehicles";
        const { rows } = await client.query(`INSERT INTO ${table} (id, label, is_synthetic) VALUES (gen_random_uuid(), $1, false) RETURNING id`, [event.label]);
        return { id: rows[0].id, label: event.label, isSynthetic: false };
      }
      default:
        throw new Error("action must be one of: migrate, seed, status, register-device, register-vehicle");
    }
  } finally {
    client.release();
    await pool.end();
  }
}
