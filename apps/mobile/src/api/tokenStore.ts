/**
 * Cognito tokens in the Android Keystore-backed secure store (expo-secure-store), so the
 * operator stays signed in across app restarts (refresh tokens last 7 days). Each token is a
 * separate key to stay under the store's per-value size guidance. Tokens are never logged.
 */
import * as SecureStore from "expo-secure-store";
import type { TokenStore, Tokens } from "./auth";

const KEYS = { access: "astig_access", id: "astig_id", refresh: "astig_refresh", expiresAt: "astig_expires_at" } as const;
const USERNAME_KEY = "astig_username";

export const secureTokenStore: TokenStore = {
  async load(): Promise<Tokens | null> {
    const [accessToken, idToken, refreshToken, expiresAt] = await Promise.all([
      SecureStore.getItemAsync(KEYS.access),
      SecureStore.getItemAsync(KEYS.id),
      SecureStore.getItemAsync(KEYS.refresh),
      SecureStore.getItemAsync(KEYS.expiresAt),
    ]);
    if (!accessToken || !idToken || !expiresAt) return null;
    return { accessToken, idToken, refreshToken: refreshToken ?? "", expiresAt: Number(expiresAt) };
  },
  async save(t: Tokens | null): Promise<void> {
    if (!t) {
      await Promise.all(Object.values(KEYS).map((k) => SecureStore.deleteItemAsync(k)));
      return;
    }
    await SecureStore.setItemAsync(KEYS.access, t.accessToken);
    await SecureStore.setItemAsync(KEYS.id, t.idToken);
    await SecureStore.setItemAsync(KEYS.refresh, t.refreshToken);
    await SecureStore.setItemAsync(KEYS.expiresAt, String(t.expiresAt));
  },
};

/** The signed-in username, for display only. */
export const storedUsername = {
  load: () => SecureStore.getItemAsync(USERNAME_KEY),
  save: (u: string | null) => (u ? SecureStore.setItemAsync(USERNAME_KEY, u) : SecureStore.deleteItemAsync(USERNAME_KEY)),
};
