import { useCallback, useMemo, useRef, useState } from "react";
import type { CognitoAuth, NewPasswordChallenge } from "@astig/api-client";
import { App } from "../App";
import type { ApiClient } from "../api/client";
import { SIGNED_OUT_TEXT } from "../api/httpClient";
import type { Role } from "../api/types";
import { SignInScreen } from "./SignInScreen";

/** The parts of CognitoAuth the gate uses (a real CognitoAuth with a fake fetch in tests). */
export type Auth = Pick<CognitoAuth, "signIn" | "completeNewPassword" | "signOut" | "roles">;

type State =
  | { phase: "signed-out"; notice: string | null }
  | { phase: "new-password"; challenge: NewPasswordChallenge }
  | { phase: "signed-in"; username: string; role: Role; session: number };

/**
 * Live mode: sign in with Cognito, then show the dashboard over the HTTP API. Tokens stay in
 * memory (CognitoAuth's default store), so a page reload asks for sign-in again. Any
 * AUTH_REQUIRED / UNAUTHENTICATED from the API returns here.
 */
export function AuthGate({ auth, makeApi }: { auth: Auth; makeApi: (onAuthLost: () => void) => ApiClient }) {
  const [state, setState] = useState<State>({ phase: "signed-out", notice: null });
  const session = useRef(0);

  const lose = useCallback(() => {
    void auth.signOut();
    setState((s) => (s.phase === "signed-in" ? { phase: "signed-out", notice: SIGNED_OUT_TEXT } : s));
  }, [auth]);
  const api = useMemo(() => makeApi(lose), [makeApi, lose]);

  async function finish(username: string) {
    // Display only; the API enforces the role on every request.
    const roles = await auth.roles();
    session.current += 1;
    setState({ phase: "signed-in", username, role: roles.includes("OFFICER") ? "OFFICER" : "OPERATOR", session: session.current });
  }

  if (state.phase === "signed-in") {
    return (
      // A fresh App per sign-in, so nothing from a previous account is shown.
      <App
        key={state.session}
        api={api}
        role={state.role}
        dataSource="live"
        account={{
          kind: "signed-in",
          username: state.username,
          onSignOut: () => {
            void auth.signOut();
            setState({ phase: "signed-out", notice: "Signed out." });
          },
        }}
      />
    );
  }

  return (
    <SignInScreen
      step={state.phase === "new-password" ? "new-password" : "credentials"}
      notice={state.phase === "signed-out" ? state.notice : null}
      onSignIn={async (username, password) => {
        const r = await auth.signIn(username, password);
        if ("kind" in r && r.kind === "NEW_PASSWORD_REQUIRED") setState({ phase: "new-password", challenge: r });
        else await finish(username);
      }}
      onNewPassword={async (password) => {
        if (state.phase !== "new-password") return;
        await auth.completeNewPassword(state.challenge, password);
        await finish(state.challenge.username);
      }}
      onCancelNewPassword={() => setState({ phase: "signed-out", notice: null })}
    />
  );
}
