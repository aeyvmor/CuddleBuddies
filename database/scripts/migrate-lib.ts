import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { ClientBase as Client } from "pg";

export const MIGRATIONS_DIR_ENV = "ASTIG_MIGRATIONS_DIR";
const MIGRATION_FILE = /^(\d{4})_[a-z0-9_]+\.sql$/;
// Arbitrary constant so concurrent migrate runs serialize instead of racing.
const MIGRATION_LOCK_KEY = 7_316_001;

/** Resolved lazily so bundled (Lambda) code can supply the directory via ASTIG_MIGRATIONS_DIR. */
export function defaultMigrationsDir(): string {
  const fromEnv = process.env[MIGRATIONS_DIR_ENV];
  if (fromEnv) return fromEnv;
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../migrations");
}

export interface MigrationFile {
  version: string;
  name: string;
  sql: string;
  checksum: string;
}

export async function loadMigrations(dir = defaultMigrationsDir()): Promise<MigrationFile[]> {
  const entries = (await readdir(dir)).filter((f) => f.endsWith(".sql")).sort();
  const seen = new Set<string>();
  const files: MigrationFile[] = [];
  for (const name of entries) {
    const match = MIGRATION_FILE.exec(name);
    if (!match) throw new Error(`Migration file name must look like 0001_description.sql: ${name}`);
    const version = match[1]!;
    if (seen.has(version)) throw new Error(`Duplicate migration version ${version}`);
    seen.add(version);
    const sql = await readFile(path.join(dir, name), "utf8");
    files.push({ version, name, sql, checksum: createHash("sha256").update(sql).digest("hex") });
  }
  return files;
}

/**
 * Applies pending migrations in order, each in its own transaction. Refuses to continue if an
 * already-applied migration file was edited (checksum mismatch): add a new migration instead.
 */
export async function migrate(client: Client, log: (msg: string) => void = console.log): Promise<string[]> {
  const migrations = await loadMigrations();
  await client.query("SELECT pg_advisory_lock($1)", [MIGRATION_LOCK_KEY]);
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version    text PRIMARY KEY,
        name       text NOT NULL,
        checksum   text NOT NULL,
        applied_at timestamptz NOT NULL DEFAULT now()
      )`);
    const { rows } = await client.query<{ version: string; checksum: string }>(
      "SELECT version, checksum FROM schema_migrations",
    );
    const applied = new Map(rows.map((r) => [r.version, r.checksum]));
    const ran: string[] = [];
    for (const m of migrations) {
      const prior = applied.get(m.version);
      if (prior !== undefined) {
        if (prior !== m.checksum) {
          throw new Error(`Migration ${m.name} was modified after being applied; create a new migration instead.`);
        }
        continue;
      }
      await client.query("BEGIN");
      try {
        await client.query(m.sql);
        await client.query("INSERT INTO schema_migrations (version, name, checksum) VALUES ($1, $2, $3)", [
          m.version,
          m.name,
          m.checksum,
        ]);
        await client.query("COMMIT");
      } catch (err) {
        await client.query("ROLLBACK");
        throw new Error(`Migration ${m.name} failed: ${(err as Error).message}`, { cause: err });
      }
      log(`applied ${m.name}`);
      ran.push(m.name);
    }
    if (ran.length === 0) log("no pending migrations");
    return ran;
  } finally {
    await client.query("SELECT pg_advisory_unlock($1)", [MIGRATION_LOCK_KEY]);
  }
}

/** Reads a required env var and fails loudly if it is missing. */
export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required (see .env.example)`);
  return value;
}

/** Destructive helpers must only ever target a loopback database. */
export function assertLocalDatabase(connectionString: string): void {
  const host = new URL(connectionString).hostname;
  if (!["localhost", "127.0.0.1", "::1", "[::1]"].includes(host)) {
    throw new Error(`Refusing destructive operation on non-local database host "${host}".`);
  }
}
