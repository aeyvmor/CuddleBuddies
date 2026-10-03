import { Role } from "@astig/contracts";
import { ApiError } from "./errors";
import type { ApiRequest } from "./http";

export interface Principal {
  subject: string;
  roles: Role[];
}

/**
 * - `jwt`: trust only claims already verified by the API Gateway JWT authorizer (e.g. Cognito).
 *   Roles come from the `cognito:groups` claim.
 * - `local-dev`: trusted headers for local development and tests ONLY. Refused inside Lambda
 *   or when NODE_ENV=production, so it cannot be deployed by accident.
 */
export type AuthMode = "jwt" | "local-dev";

export const DEV_SUBJECT_HEADER = "x-astig-dev-subject";
export const DEV_ROLES_HEADER = "x-astig-dev-roles";

export function assertAuthModeAllowed(mode: AuthMode, env: NodeJS.ProcessEnv = process.env): void {
  if (mode === "local-dev" && (env.AWS_LAMBDA_FUNCTION_NAME || env.NODE_ENV === "production")) {
    throw new Error("ASTIG_AUTH_MODE=local-dev is not allowed in Lambda or production.");
  }
}

function parseRoles(raw: unknown): Role[] {
  let values: string[] = [];
  if (Array.isArray(raw)) values = raw.map(String);
  // API Gateway HTTP APIs render array claims as "[A B]".
  else if (typeof raw === "string") values = raw.replace(/^\[|\]$/g, "").split(/[\s,]+/);
  return [...new Set(values.map((v) => v.trim().toUpperCase()).filter((v): v is Role => Role.safeParse(v).success))];
}

export function authenticate(req: ApiRequest, mode: AuthMode): Principal {
  let subject: unknown;
  let roles: Role[];
  if (mode === "jwt") {
    subject = req.jwtClaims?.sub;
    roles = parseRoles(req.jwtClaims?.["cognito:groups"]);
  } else {
    subject = req.headers[DEV_SUBJECT_HEADER];
    roles = parseRoles(req.headers[DEV_ROLES_HEADER]);
  }
  if (typeof subject !== "string" || subject.length === 0 || subject.length > 200) {
    throw new ApiError("UNAUTHENTICATED", "Authentication required.");
  }
  return { subject, roles };
}

export function requireRole(principal: Principal, role: Role): void {
  if (!principal.roles.includes(role)) throw new ApiError("FORBIDDEN", `Requires role ${role}.`);
}
