import { StrictMode, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import "./styles/tokens.css";
import "./styles/global.css";
import { App } from "./App";
import { createMockApi } from "./api/mockClient";
import type { ActorRole } from "./api/types";

/** Mock API wiring. Replace with the HTTP client once the contract is frozen. */
function Root() {
  const [role, setRole] = useState<ActorRole>("VIEWER");
  const roleRef = useRef(role);
  roleRef.current = role;
  const api = useMemo(() => createMockApi({ getRole: () => roleRef.current }), []);
  return <App api={api} role={role} onRoleChange={setRole} />;
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
);
