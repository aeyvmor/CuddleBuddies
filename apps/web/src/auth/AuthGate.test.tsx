import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { AstigClient, CognitoAuth } from "@astig/api-client";
import { createHttpApi, FORBIDDEN_TEXT, SIGNED_OUT_TEXT } from "../api/httpClient";
import { createMockApi } from "../api/mockClient";
import { AuthGate } from "./AuthGate";

const b64url = (o: unknown) => btoa(JSON.stringify(o)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
/** An unsigned JWT-shaped ID token (the app reads the groups for display only). */
const idToken = (groups: string[]) => `${b64url({ alg: "none" })}.${b64url({ "cognito:groups": groups, "cognito:username": "x" })}.sig`;
const tokens = (groups: string[]) => ({ AuthenticationResult: { AccessToken: "access-1", IdToken: idToken(groups), RefreshToken: "refresh-1", ExpiresIn: 3600 } });

interface CognitoCall {
  target: string;
  body: Record<string, any>;
}

/** Fake Cognito endpoint. `respond` gets the action name (InitiateAuth, RespondToAuthChallenge) and the request body. */
function fakeCognito(respond: (c: CognitoCall) => { status: number; json: unknown }) {
  const calls: CognitoCall[] = [];
  const fetchImpl = (async (_url: RequestInfo | URL, init?: RequestInit) => {
    const headers = init?.headers as Record<string, string>;
    const c = { target: headers["x-amz-target"]!.replace("AWSCognitoIdentityProviderService.", ""), body: JSON.parse(String(init?.body)) };
    calls.push(c);
    const r = respond(c);
    return new Response(JSON.stringify(r.json), { status: r.status });
  }) as typeof fetch;
  return { calls, auth: new CognitoAuth({ region: "ap-southeast-1", clientId: "client-xyz", fetchImpl }) };
}

/** Officer data from the mock, behind the real gate. */
const mockApi = () => createMockApi({ getRole: () => "OFFICER" });

async function signIn(user: ReturnType<typeof userEvent.setup>, username = "demo-officer", password = "pw-not-real") {
  await user.type(screen.getByLabelText("Username"), username);
  await user.type(screen.getByLabelText("Password"), password);
  await user.keyboard("{Enter}");
}

describe("sign-in", () => {
  it("signs in with USER_PASSWORD_AUTH and shows who is signed in", async () => {
    const user = userEvent.setup();
    const { auth, calls } = fakeCognito(() => ({ status: 200, json: tokens(["OFFICER"]) }));
    render(<AuthGate auth={auth} makeApi={mockApi} />);
    expect(screen.getByRole("heading", { name: "Sign in to the operations dashboard" })).toBeInTheDocument();
    await signIn(user);
    expect(await screen.findByText("demo-officer")).toBeInTheDocument();
    expect(screen.getByText(/Signed in · Officer/)).toBeInTheDocument();
    expect(calls[0]).toMatchObject({ target: "InitiateAuth", body: { AuthFlow: "USER_PASSWORD_AUTH", ClientId: "client-xyz", AuthParameters: { USERNAME: "demo-officer" } } });
    expect(await screen.findAllByRole("button", { name: /Map marker/ })).not.toHaveLength(0);
  });

  it("shows a wrong password as a visible error and stays on sign-in", async () => {
    const user = userEvent.setup();
    const { auth } = fakeCognito(() => ({ status: 400, json: { __type: "NotAuthorizedException", message: "Incorrect username or password." } }));
    render(<AuthGate auth={auth} makeApi={mockApi} />);
    await signIn(user);
    expect(await screen.findByRole("alert")).toHaveTextContent("Incorrect username or password.");
    expect(screen.getByLabelText("Username")).toHaveValue("demo-officer");
  });

  it("asks for both fields before contacting Cognito", async () => {
    const user = userEvent.setup();
    const { auth, calls } = fakeCognito(() => ({ status: 200, json: tokens(["OFFICER"]) }));
    render(<AuthGate auth={auth} makeApi={mockApi} />);
    await user.click(screen.getByRole("button", { name: "Sign in" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Enter your username and password.");
    expect(calls).toHaveLength(0);
  });

  it("handles NEW_PASSWORD_REQUIRED: checks the confirmation, then completes the challenge", async () => {
    const user = userEvent.setup();
    const { auth, calls } = fakeCognito((c) =>
      c.target === "InitiateAuth"
        ? { status: 200, json: { ChallengeName: "NEW_PASSWORD_REQUIRED", Session: "session-abc" } }
        : { status: 200, json: tokens(["OFFICER"]) },
    );
    render(<AuthGate auth={auth} makeApi={mockApi} />);
    await signIn(user, "new-officer");
    const heading = await screen.findByRole("heading", { name: "Set a new password" });
    await waitFor(() => expect(document.activeElement).toBe(heading));

    await user.type(screen.getByLabelText("New password"), "Fresh-pass-1");
    await user.type(screen.getByLabelText("Confirm new password"), "Fresh-pass-2");
    await user.click(screen.getByRole("button", { name: "Set password and sign in" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("The two passwords do not match.");
    expect(calls).toHaveLength(1);

    await user.clear(screen.getByLabelText("Confirm new password"));
    await user.type(screen.getByLabelText("Confirm new password"), "Fresh-pass-1");
    await user.click(screen.getByRole("button", { name: "Set password and sign in" }));
    expect(await screen.findByText("new-officer")).toBeInTheDocument();
    expect(calls[1]).toMatchObject({
      target: "RespondToAuthChallenge",
      body: { ChallengeName: "NEW_PASSWORD_REQUIRED", Session: "session-abc", ChallengeResponses: { USERNAME: "new-officer", NEW_PASSWORD: "Fresh-pass-1" } },
    });
  });

  it("explains a rejected new password", async () => {
    const user = userEvent.setup();
    const { auth } = fakeCognito((c) =>
      c.target === "InitiateAuth"
        ? { status: 200, json: { ChallengeName: "NEW_PASSWORD_REQUIRED", Session: "s" } }
        : { status: 400, json: { __type: "InvalidPasswordException", message: "Password does not conform to policy" } },
    );
    render(<AuthGate auth={auth} makeApi={mockApi} />);
    await signIn(user);
    await screen.findByRole("heading", { name: "Set a new password" });
    await user.type(screen.getByLabelText("New password"), "short");
    await user.type(screen.getByLabelText("Confirm new password"), "short");
    await user.keyboard("{Enter}");
    expect(await screen.findByRole("alert")).toHaveTextContent(/password rules/);
  });

  it("signs out back to the sign-in screen", async () => {
    const user = userEvent.setup();
    const { auth } = fakeCognito(() => ({ status: 200, json: tokens(["OFFICER"]) }));
    render(<AuthGate auth={auth} makeApi={mockApi} />);
    await signIn(user);
    await user.click(await screen.findByRole("button", { name: "Sign out" }));
    expect(await screen.findByRole("heading", { name: "Sign in to the operations dashboard" })).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Signed out.");
    await expect(auth.getAccessToken()).rejects.toMatchObject({ code: "AUTH_REQUIRED" });
  });
});

describe("live API errors at the gate", () => {
  const apiWith = (auth: CognitoAuth, status: number, code: string) => (onAuthLost: () => void) =>
    createHttpApi({
      client: new AstigClient({
        baseUrl: "https://api.test",
        getToken: () => auth.getAccessToken(),
        fetchImpl: (async () => new Response(JSON.stringify({ error: { code, message: "x", requestId: "req-7" } }), { status })) as typeof fetch,
        onUnauthenticated: onAuthLost,
        maxRetries: 0,
      }),
      onAuthLost,
    });

  it("returns to sign-in when the API says the session is no longer valid", async () => {
    const user = userEvent.setup();
    const { auth } = fakeCognito(() => ({ status: 200, json: tokens(["OFFICER"]) }));
    render(<AuthGate auth={auth} makeApi={apiWith(auth, 401, "UNAUTHENTICATED")} />);
    await signIn(user);
    expect(await screen.findByRole("heading", { name: "Sign in to the operations dashboard" })).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent(SIGNED_OUT_TEXT);
  });

  it("tells an account without the officer role that it can't use the dashboard", async () => {
    const user = userEvent.setup();
    const { auth } = fakeCognito(() => ({ status: 200, json: tokens(["OPERATOR"]) }));
    const spy = vi.fn(apiWith(auth, 403, "FORBIDDEN"));
    render(<AuthGate auth={auth} makeApi={spy} />);
    await signIn(user, "demo-operator");
    const alert = (await screen.findAllByRole("alert"))[0]!;
    expect(alert).toHaveTextContent(FORBIDDEN_TEXT);
    expect(alert).toHaveTextContent("req-7");
    expect(screen.getByText(/No officer role/)).toBeInTheDocument();
    expect(within(screen.getByRole("banner")).getByRole("button", { name: "Sign out" })).toBeInTheDocument();
  });
});
