import pg from "pg";
import { requireEnv } from "./migrate-lib";
import { seed } from "./seed-lib";

const client = new pg.Client({ connectionString: requireEnv("DATABASE_URL") });
await client.connect();
try {
  await seed(client);
} finally {
  await client.end();
}
