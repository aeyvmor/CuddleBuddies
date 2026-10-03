import pg from "pg";
import { assertLocalDatabase, migrate } from "../scripts/migrate-lib";

/**
 * Recreates the test database from scratch and applies all migrations, proving that a fresh
 * database can be built from the ordered migrations alone. Requires TEST_DATABASE_URL pointing
 * at the local Docker PostGIS (see .env.example); fails loudly if it is missing.
 */
export default async function setup(): Promise<void> {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) throw new Error("TEST_DATABASE_URL is required for `npm run test:db` (see .env.example; run `npm run db:up`).");
  assertLocalDatabase(url);
  const target = new URL(url);
  const dbName = target.pathname.replace(/^\//, "");
  if (!/^[a-z_][a-z0-9_]*_test$/.test(dbName)) throw new Error(`Test database name must end in _test, got "${dbName}".`);

  const admin = new URL(url);
  admin.pathname = "/postgres";
  const adminClient = new pg.Client({ connectionString: admin.toString() });
  await adminClient.connect();
  try {
    await adminClient.query(`DROP DATABASE IF EXISTS ${dbName} WITH (FORCE)`);
    await adminClient.query(`CREATE DATABASE ${dbName}`);
  } finally {
    await adminClient.end();
  }

  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    await migrate(client, () => undefined);
  } finally {
    await client.end();
  }
}
