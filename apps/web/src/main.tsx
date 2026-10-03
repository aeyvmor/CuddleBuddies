import { StrictMode, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { ASTIG_DEV, AstigClient, CognitoAuth } from "@astig/api-client";
import "@fontsource-variable/plus-jakarta-sans";
import "./styles/tokens.css";
import "./styles/global.css";
import { App } from "./App";
import { createHttpApi } from "./api/httpClient";
import { createMockApi } from "./api/mockClient";
import type { Role } from "./api/types";
import { AuthGate } from "./auth/AuthGate";

/**
 * VITE_ASTIG_API selects the data source: "live" (the deployed API, sign-in required) or
 * "mock" (built-in synthetic data, offline). Default: live, except under the test runner.
 */
const requested = import.meta.env.VITE_ASTIG_API ?? (import.meta.env.MODE === "test" ? "mock" : "live");

/** Offline demo: synthetic data and a role picker, no sign-in. */
function MockRoot() {
  const [role, setRole] = useState<Role>("OFFICER");
  const roleRef = useRef(role);
  roleRef.current = role;
  const api = useMemo(() => createMockApi({ getRole: () => roleRef.current }), []);
  return <App api={api} role={role} dataSource="mock" account={{ kind: "demo-role", onRoleChange: setRole }} />;
}

/** Deployed backend (ap-southeast-1 dev). The ids are not secrets; every call needs a Cognito token. */
function LiveRoot() {
  const auth = useMemo(() => new CognitoAuth({ region: ASTIG_DEV.cognitoRegion, clientId: ASTIG_DEV.cognitoClientId }), []);
  const makeApi = useMemo(
    () => (onAuthLost: () => void) =>
      createHttpApi({
        client: new AstigClient({ baseUrl: ASTIG_DEV.baseUrl, getToken: () => auth.getAccessToken(), onUnauthenticated: onAuthLost }),
        onAuthLost,
      }),
    [auth],
  );
  return <AuthGate auth={auth} makeApi={makeApi} />;
}

function ConfigError() {
  return (
    <main style={{ padding: "var(--space-6)" }}>
      <h1>Configuration error</h1>
      <p role="alert">
        VITE_ASTIG_API is "{String(requested)}". Use "live" or "mock".
      </p>
    </main>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>{requested === "live" ? <LiveRoot /> : requested === "mock" ? <MockRoot /> : <ConfigError />}</StrictMode>,
);
