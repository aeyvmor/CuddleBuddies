import type { ErrorCode } from "@astig/contracts";
import type { ClientBase, Pool, PoolClient } from "pg";

/** Expected, client-actionable data-layer failure carrying a stable contract error code. */
export class DataError extends Error {
  override readonly name = "DataError";
  constructor(
    readonly code: ErrorCode,
    message: string,
  ) {
    super(message);
  }
}

/** A single connection (pg.Client or a checked-out pg.PoolClient). */
export type Queryable = ClientBase;

/** Runs `fn` in a transaction on one pooled connection; rolls back and rethrows on any error. */
export async function withTransaction<T>(pool: Pool, fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
}

/** PostgreSQL SQLSTATE for unique_violation, optionally for a specific constraint/index. */
export function isUniqueViolation(err: unknown, constraint?: string): boolean {
  const e = err as { code?: string; constraint?: string };
  return e?.code === "23505" && (constraint === undefined || e.constraint === constraint);
}

/** pg returns timestamptz as Date and numeric as string; normalize at the boundary. */
export const toIso = (d: Date): string => d.toISOString();
export const toIsoOrNull = (d: Date | null): string | null => (d === null ? null : d.toISOString());
export const toNumber = (v: string | number): number => (typeof v === "number" ? v : Number(v));
export const toNumberOrNull = (v: string | number | null): number | null => (v === null ? null : toNumber(v));
