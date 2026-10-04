/**
 * Copied from packages/api-client/src/auth.ts (commit 0a2f58c).
 * Adapted: explicit fields instead of TypeScript parameter properties (for `node --test`);
 * no other change in behavior. Tokens persist through a TokenStore (src/api/tokenStore.ts
 * uses expo-secure-store on the phone). Never log tokens.
 */
import { AstigApiError } from "./errors.ts";

/**
 * Minimal Cognito User Pools sign-in over the public HTTPS endpoint (no AWS SDK or credentials).
 * Uses USER_PASSWORD_AUTH (enabled on the app client) and REFRESH_TOKEN_AUTH.
 */
export interface Tokens {
  accessToken: string;
  idToken: string;
  refreshToken: string;
  /** Epoch ms when the access token expires. */
  expiresAt: number;
}

export interface TokenStore {
  load(): Promise<Tokens | null> | Tokens | null;
  save(tokens: Tokens | null): Promise<void> | void;
}

export const memoryTokenStore = (): TokenStore => {
  let t: Tokens | null = null;
  return { load: () => t, save: (v) => void (t = v) };
};

export type NewPasswordChallenge = { kind: "NEW_PASSWORD_REQUIRED"; session: string; username: string };

export interface CognitoConfig {
  region: string;
  clientId: string;
  fetchImpl?: typeof fetch;
  store?: TokenStore;
  now?: () => number;
}

export class CognitoAuth {
  private readonly cfg: CognitoConfig;
  private readonly store: TokenStore;
  private readonly now: () => number;
  private refreshing: Promise<Tokens> | null = null;

  constructor(cfg: CognitoConfig) {
    this.cfg = cfg;
    this.store = cfg.store ?? memoryTokenStore();
    this.now = cfg.now ?? Date.now;
  }

  private async call(target: string, body: unknown): Promise<any> {
    const doFetch = this.cfg.fetchImpl ?? fetch;
    let res: Response;
    try {
      res = await doFetch(`https://cognito-idp.${this.cfg.region}.amazonaws.com/`, {
        method: "POST",
        headers: { "content-type": "application/x-amz-json-1.1", "x-amz-target": `AWSCognitoIdentityProviderService.${target}` },
        body: JSON.stringify(body),
      });
    } catch {
      throw new AstigApiError(0, "NETWORK_ERROR", "Could not reach the sign-in service.");
    }
    const json: any = await res.json().catch(() => ({}));
    if (!res.ok) {
      const type = String(json?.__type ?? "");
      const message = type.includes("NotAuthorized") ? "Incorrect username or password." : type.includes("PasswordReset") ? "Password reset required." : "Sign-in failed.";
      throw new AstigApiError(res.status, "UNAUTHENTICATED", message);
    }
    return json;
  }

  private toTokens(r: any, previousRefresh?: string): Tokens {
    const a = r?.AuthenticationResult;
    if (!a?.AccessToken || !a?.IdToken) throw new AstigApiError(500, "UNEXPECTED_RESPONSE", "Sign-in response had no tokens.");
    return {
      accessToken: a.AccessToken,
      idToken: a.IdToken,
      refreshToken: a.RefreshToken ?? previousRefresh ?? "",
      expiresAt: this.now() + Number(a.ExpiresIn ?? 3600) * 1000,
    };
  }

  /** Signs in. Returns a challenge if the user must set a new password (first login after admin creation). */
  async signIn(username: string, password: string): Promise<Tokens | NewPasswordChallenge> {
    const r = await this.call("InitiateAuth", { AuthFlow: "USER_PASSWORD_AUTH", ClientId: this.cfg.clientId, AuthParameters: { USERNAME: username, PASSWORD: password } });
    if (r?.ChallengeName === "NEW_PASSWORD_REQUIRED") return { kind: "NEW_PASSWORD_REQUIRED", session: r.Session, username };
    if (r?.ChallengeName) throw new AstigApiError(400, "UNAUTHENTICATED", `Unsupported sign-in step: ${r.ChallengeName}.`);
    const t = this.toTokens(r);
    await this.store.save(t);
    return t;
  }

  async completeNewPassword(challenge: NewPasswordChallenge, newPassword: string): Promise<Tokens> {
    const r = await this.call("RespondToAuthChallenge", {
      ChallengeName: "NEW_PASSWORD_REQUIRED",
      ClientId: this.cfg.clientId,
      Session: challenge.session,
      ChallengeResponses: { USERNAME: challenge.username, NEW_PASSWORD: newPassword },
    });
    const t = this.toTokens(r);
    await this.store.save(t);
    return t;
  }

  async signOut(): Promise<void> {
    await this.store.save(null);
  }

  /** Returns a valid access token, refreshing 60 s before expiry. Concurrent callers share one refresh. */
  async getAccessToken(): Promise<string> {
    const t = await this.store.load();
    if (!t) throw new AstigApiError(401, "AUTH_REQUIRED", "Please sign in.");
    if (t.expiresAt - 60_000 > this.now()) return t.accessToken;
    if (!t.refreshToken) {
      await this.store.save(null);
      throw new AstigApiError(401, "AUTH_REQUIRED", "Session expired. Please sign in again.");
    }
    this.refreshing ??= (async () => {
      try {
        const r = await this.call("InitiateAuth", { AuthFlow: "REFRESH_TOKEN_AUTH", ClientId: this.cfg.clientId, AuthParameters: { REFRESH_TOKEN: t.refreshToken } });
        const next = this.toTokens(r, t.refreshToken);
        await this.store.save(next);
        return next;
      } catch (err) {
        await this.store.save(null);
        throw err instanceof AstigApiError && err.code !== "NETWORK_ERROR" ? new AstigApiError(401, "AUTH_REQUIRED", "Session expired. Please sign in again.") : err;
      } finally {
        this.refreshing = null;
      }
    })();
    return (await this.refreshing).accessToken;
  }

  /** Roles from the ID token's cognito:groups claim (display only; the API enforces roles). */
  async roles(): Promise<string[]> {
    const t = await this.store.load();
    if (!t) return [];
    try {
      const payload = t.idToken.split(".")[1]!.replace(/-/g, "+").replace(/_/g, "/");
      const json = JSON.parse(globalThis.atob(payload.padEnd(payload.length + ((4 - (payload.length % 4)) % 4), "=")));
      return Array.isArray(json["cognito:groups"]) ? json["cognito:groups"] : [];
    } catch {
      return [];
    }
  }
}
