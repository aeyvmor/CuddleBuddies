export { AstigClient, type AstigClientConfig, type ListIssuesParams, type UploadBody } from "./client";
export { CognitoAuth, memoryTokenStore, type CognitoConfig, type NewPasswordChallenge, type TokenStore, type Tokens } from "./auth";
export { AstigApiError } from "./errors";

/** Dev deployment (ap-southeast-1). Not secrets: the API requires a Cognito token for every call. */
export const ASTIG_DEV = {
  baseUrl: "https://2jpf5wobhl.execute-api.ap-southeast-1.amazonaws.com",
  cognitoRegion: "ap-southeast-1",
  cognitoUserPoolId: "ap-southeast-1_uYQoBKBkj",
  cognitoClientId: "7dgk8feqomk5d5q0vr81fp7m86",
} as const;

/** RFC 9562 v4 UUID from a CSPRNG (crypto.getRandomValues: browsers, Node 19+, RN with a polyfill). */
export function newId(): string {
  const c = (globalThis as any).crypto;
  if (c?.randomUUID) return c.randomUUID();
  if (!c?.getRandomValues) throw new Error("No secure random source; install react-native-get-random-values.");
  const b: Uint8Array = c.getRandomValues(new Uint8Array(16));
  b[6] = (b[6]! & 0x0f) | 0x40;
  b[8] = (b[8]! & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}
