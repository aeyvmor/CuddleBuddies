import pg from "pg";
import { assertLocalDatabase, migrate, requireEnv } from "./migrate-lib";
import { seed } from "./seed-lib";

// Local-only: drops the public schema (all ASTIG tables), re-applies migrations, and re-seeds.
const url = requireEnv("DATABASE_URL");
assertLocalDatabase(url);

const client = new pg.Client({ connectionString: url });
await client.connect();
try {
  await client.query("DROP SCHEMA public CASCADE");
  await client.query("CREATE SCHEMA public");
  console.log("dropped and recreated schema public");
  await migrate(client);
  await seed(client);
} finally {
  await client.end();
}
