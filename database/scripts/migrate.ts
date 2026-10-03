import pg from "pg";
import { migrate, requireEnv } from "./migrate-lib";

const client = new pg.Client({ connectionString: requireEnv("DATABASE_URL") });
await client.connect();
try {
  await migrate(client);
} finally {
  await client.end();
}
