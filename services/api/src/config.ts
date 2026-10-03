import { assertAuthModeAllowed, type AuthMode } from "./auth";

export interface ApiConfig {
  authMode: AuthMode;
  port: number;
  /** Private evidence bucket; when absent, evidence is UNAVAILABLE and uploads are refused. */
  evidenceBucket: string | null;
}

/** Validates required configuration at startup and fails loudly instead of defaulting silently. */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): ApiConfig {
  if (!env.DATABASE_URL && !env.DB_SECRET_ARN) {
    throw new Error("DATABASE_URL (local) or DB_SECRET_ARN (deployed) is required (see .env.example).");
  }
  const authMode = env.ASTIG_AUTH_MODE;
  if (authMode !== "jwt" && authMode !== "local-dev") {
    throw new Error("ASTIG_AUTH_MODE must be 'jwt' or 'local-dev'.");
  }
  assertAuthModeAllowed(authMode, env);
  const port = Number(env.API_PORT ?? 3001);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("API_PORT must be a valid TCP port.");
  return { authMode, port, evidenceBucket: env.S3_EVIDENCE_BUCKET || null };
}
