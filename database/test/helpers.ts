import pg from "pg";
import { seed } from "../scripts/seed-lib";

export function testDatabaseUrl(): string {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) throw new Error("TEST_DATABASE_URL is required");
  return url;
}

const TABLES = [
  "work_order_events",
  "work_orders",
  "risk_score_components",
  "risk_assessments",
  "detections",
  "observations",
  "issues",
  "inspection_sessions",
  "vehicles",
  "devices",
  "admin_areas",
];

/** Empties every ASTIG table and re-inserts the deterministic synthetic seed. */
export async function resetAndSeed(client: pg.ClientBase): Promise<void> {
  await client.query(`TRUNCATE ${TABLES.join(", ")} RESTART IDENTITY CASCADE`);
  await seed(client as pg.Client, () => undefined);
}

/** Returns the SQLSTATE of the error thrown by `fn`, failing if it does not throw. */
export async function sqlState(fn: () => Promise<unknown>): Promise<string> {
  try {
    await fn();
  } catch (err) {
    return (err as { code?: string }).code ?? "NO_CODE";
  }
  throw new Error("expected a database error");
}
