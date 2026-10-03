import { StrictMode, useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { ASTIG_DEV, AstigClient, CognitoAuth } from "@astig/api-client";
import "@fontsource-variable/plus-jakarta-sans";
import "./styles/tokens.css";
import "./styles/global.css";
import { App } from "./App";
import { createHttpApi } from "./api/httpClient";
import { createMockApi } from "./api/mockClient";
import type { Role } from "./api/types";
import { SignIn } from "./components/SignIn";
import signInStyles from "./components/SignIn.module.css";

/**
 * Data source: VITE_ASTIG_API=mock uses the in-memory synthetic mock (offline demo, no login);
 * anything else (default) uses the live backend with Cognito sign-in. Tokens stay in memory only.
 */
const MODE = import.meta.env.VITE_ASTIG_API === "mock" ? "mock" : "live";

function MockRoot() {
  const [role, setRole] = useState<Role>("OPERATOR");
  const roleRef = useRef(role);
  roleRef.current = role;
  const api = useMemo(() => createMockApi({ getRole: () => roleRef.current }), []);
  return <App api={api} role={role} onRoleChange={setRole} />;
}

function LiveRoot() {
  const auth = useMemo(() => new CognitoAuth({ region: ASTIG_DEV.cognitoRegion, clientId: ASTIG_DEV.cognitoClientId }), []);
  const [signedIn, setSignedIn] = useState(false);
  const [roles, setRoles] = useState<string[]>([]);
  // The role selector changes what the UI offers; the API still enforces the signed-in user's groups.
  const [role, setRole] = useState<Role>("OFFICER");
  const api = useMemo(
    () =>
      createHttpApi(
        new AstigClient({ baseUrl: ASTIG_DEV.baseUrl, getToken: () => auth.getAccessToken(), onUnauthenticated: () => setSignedIn(false) }),
      ),
    [auth],
  );

  useEffect(() => {
    if (!signedIn) return;
    void auth.roles().then((r) => {
      setRoles(r);
      setRole(r.includes("OFFICER") ? "OFFICER" : "OPERATOR");
    });
  }, [auth, signedIn]);

  if (!signedIn) return <SignIn auth={auth} onSignedIn={() => setSignedIn(true)} />;
  return (
    <>
      <div className={signInStyles.session}>
        <span>Signed in · live data · roles: {roles.join(", ") || "none"}</span>
        <button
          type="button"
          className={signInStyles.signout}
          onClick={() => {
            void auth.signOut();
            setSignedIn(false);
          }}
        >
          Sign out
        </button>
      </div>
      <App api={api} role={role} onRoleChange={setRole} />
    </>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>{MODE === "mock" ? <MockRoot /> : <LiveRoot />}</StrictMode>,
);
