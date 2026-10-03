import { GetSecretValueCommand, SecretsManagerClient } from "@aws-sdk/client-secrets-manager";
import pg from "pg";

/**
 * Creates a pg Pool from the environment:
 * - DATABASE_URL: local development/tests (plain connection string).
 * - DB_SECRET_ARN: deployed. Reads the RDS-managed secret (host/port/username/password/dbname)
 *   through the VPC's Secrets Manager endpoint and connects with verified TLS. In Lambda,
 *   NODE_EXTRA_CA_CERTS=/var/runtime/ca-cert.pem makes the RDS CA bundle trusted.
 * Fails loudly if neither is configured.
 */
export async function createPoolFromEnv(
  options: { max: number; env?: NodeJS.ProcessEnv } = { max: 2 },
): Promise<pg.Pool> {
  const env = options.env ?? process.env;
  if (env.DATABASE_URL) {
    return new pg.Pool({ connectionString: env.DATABASE_URL, max: options.max });
  }
  const secretArn = env.DB_SECRET_ARN;
  if (!secretArn) throw new Error("Either DATABASE_URL or DB_SECRET_ARN is required.");

  const sm = new SecretsManagerClient({});
  const res = await sm.send(new GetSecretValueCommand({ SecretId: secretArn }));
  if (!res.SecretString) throw new Error("Database secret has no SecretString.");
  const s = JSON.parse(res.SecretString) as { host?: string; port?: number; username?: string; password?: string; dbname?: string };
  if (!s.host || !s.username || !s.password) throw new Error("Database secret is missing host/username/password.");

  return new pg.Pool({
    host: s.host,
    port: s.port ?? 5432,
    user: s.username,
    password: s.password,
    database: env.DB_NAME ?? s.dbname ?? "astig",
    ssl: { rejectUnauthorized: true },
    max: options.max,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
  });
}
