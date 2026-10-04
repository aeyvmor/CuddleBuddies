/**
 * Operator sign-in state for uploads (Cognito via the copied CognitoAuth). Capture never
 * needs sign-in: captures queue on the phone and upload once an account is signed in.
 */
import { useCallback, useEffect, useState } from "react";
import { AstigApiError } from "./api/errors";
import type { CognitoAuth, NewPasswordChallenge } from "./api/auth";
import { storedUsername } from "./api/tokenStore";

export type AccountState =
  | { status: "LOADING" }
  | { status: "SIGNED_OUT"; notice: string | null }
  | { status: "NEW_PASSWORD"; challenge: NewPasswordChallenge }
  | { status: "SIGNED_IN"; username: string; isOperator: boolean };

export interface Account {
  state: AccountState;
  /** Resolves to an error message, or null on success. */
  signIn: (username: string, password: string) => Promise<string | null>;
  completeNewPassword: (password: string) => Promise<string | null>;
  cancelNewPassword: () => void;
  signOut: () => void;
  /** The API said the sign-in is no longer valid. */
  lost: () => void;
}

const message = (e: unknown) => (e instanceof AstigApiError || e instanceof Error ? e.message : "Sign-in failed.");

export function useAccount(auth: CognitoAuth): Account {
  const [state, setState] = useState<AccountState>({ status: "LOADING" });

  const finish = useCallback(
    async (username: string) => {
      await storedUsername.save(username);
      const roles = await auth.roles();
      setState({ status: "SIGNED_IN", username, isOperator: roles.includes("OPERATOR") });
    },
    [auth],
  );

  // Tokens survive restarts in the secure store; validity is checked on the next API call.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const [username, roles] = await Promise.all([storedUsername.load(), auth.roles()]);
      if (cancelled) return;
      setState(username && roles.length > 0 ? { status: "SIGNED_IN", username, isOperator: roles.includes("OPERATOR") } : { status: "SIGNED_OUT", notice: null });
    })().catch(() => !cancelled && setState({ status: "SIGNED_OUT", notice: null }));
    return () => {
      cancelled = true;
    };
  }, [auth]);

  const signIn = useCallback(
    async (username: string, password: string) => {
      if (!username.trim() || !password) return "Enter the username and password.";
      try {
        const r = await auth.signIn(username.trim(), password);
        if ("kind" in r) setState({ status: "NEW_PASSWORD", challenge: r });
        else await finish(username.trim());
        return null;
      } catch (e) {
        return message(e);
      }
    },
    [auth, finish],
  );

  const completeNewPassword = useCallback(
    async (password: string) => {
      if (state.status !== "NEW_PASSWORD") return null;
      if (password.length < 12) return "Use at least 12 characters, with upper- and lower-case letters and a digit.";
      try {
        await auth.completeNewPassword(state.challenge, password);
        await finish(state.challenge.username);
        return null;
      } catch (e) {
        return `${message(e)} Check that the password meets the rules: at least 12 characters, upper- and lower-case letters and a digit.`;
      }
    },
    [auth, finish, state],
  );

  const signOut = useCallback(() => {
    void auth.signOut();
    void storedUsername.save(null);
    setState({ status: "SIGNED_OUT", notice: "Signed out. Captures stay on this phone until someone signs in." });
  }, [auth]);

  const lost = useCallback(() => {
    void auth.signOut();
    setState((s) => (s.status === "SIGNED_IN" ? { status: "SIGNED_OUT", notice: "The sign-in expired. Sign in again to resume uploads." } : s));
  }, [auth]);

  return { state, signIn, completeNewPassword, cancelNewPassword: () => setState({ status: "SIGNED_OUT", notice: null }), signOut, lost };
}
