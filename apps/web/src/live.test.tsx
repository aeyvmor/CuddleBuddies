import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AstigApiError, AstigClient } from "@astig/api-client";
import { createHttpApi } from "./api/httpClient";
import { ApiError } from "./api/types";
import { SignIn } from "./components/SignIn";

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status });

function client(handler: (url: URL, init: RequestInit) => Response) {
  const calls: URL[] = [];
  const fetchImpl = (async (url: string, init: RequestInit) => {
    const u = new URL(url);
    calls.push(u);
    return handler(u, init);
  }) as unknown as typeof fetch;
  return { api: createHttpApi(new AstigClient({ baseUrl: "https://api.test", getToken: async () => "tok", fetchImpl, sleep: async () => undefined })), calls };
}

describe("createHttpApi", () => {
  it("passes filters to GET /issues and follows the cursor into one array", async () => {
    const { api, calls } = client((u) =>
      u.searchParams.get("cursor") ? json(200, { items: [{ n: 2 }], nextCursor: null, areaNames: [] }) : json(200, { items: [{ n: 1 }], nextCursor: "c1", areaNames: ["Manila"] }),
    );
    const items = await api.listIssues({ severity: "HIGH", workOrderStatus: "NONE" });
    expect(items).toEqual([{ n: 1 }, { n: 2 }]);
    expect(Object.fromEntries(calls[0]!.searchParams)).toEqual({ severity: "HIGH", workOrderStatus: "NONE", limit: "200" });
    expect(calls[1]!.searchParams.get("cursor")).toBe("c1");
  });

  it("turns API errors into the web ApiError (code + requestId) the UI already handles", async () => {
    const { api } = client(() => json(409, { error: { code: "INVALID_TRANSITION", message: "Cannot move work order from OPEN to RESOLVED.", requestId: "r9" } }));
    const err = await api.updateWorkOrder("w", { status: "RESOLVED" }).catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({ code: "INVALID_TRANSITION", requestId: "r9", message: "Cannot move work order from OPEN to RESOLVED." });
  });
});

describe("SignIn", () => {
  it("signs in and reports success", async () => {
    const onSignedIn = vi.fn();
    const auth = { signIn: vi.fn().mockResolvedValue({ accessToken: "a" }), completeNewPassword: vi.fn() };
    render(<SignIn auth={auth as never} onSignedIn={onSignedIn} />);
    await userEvent.type(screen.getByLabelText("Username"), "demo-officer");
    await userEvent.type(screen.getByLabelText("Password"), "pw");
    await userEvent.click(screen.getByRole("button", { name: "Sign in" }));
    expect(auth.signIn).toHaveBeenCalledWith("demo-officer", "pw");
    expect(onSignedIn).toHaveBeenCalled();
  });

  it("handles the first-login new-password step", async () => {
    const onSignedIn = vi.fn();
    const challenge = { kind: "NEW_PASSWORD_REQUIRED", session: "s", username: "demo-officer" };
    const auth = { signIn: vi.fn().mockResolvedValue(challenge), completeNewPassword: vi.fn().mockResolvedValue({}) };
    render(<SignIn auth={auth as never} onSignedIn={onSignedIn} />);
    await userEvent.type(screen.getByLabelText("Username"), "demo-officer");
    await userEvent.type(screen.getByLabelText("Password"), "temp");
    await userEvent.click(screen.getByRole("button", { name: "Sign in" }));
    expect(await screen.findByRole("heading", { name: "Set a new password" })).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText("New password"), "NewPassword123");
    await userEvent.click(screen.getByRole("button", { name: "Set password and continue" }));
    expect(auth.completeNewPassword).toHaveBeenCalledWith(challenge, "NewPassword123");
    expect(onSignedIn).toHaveBeenCalled();
  });

  it("shows a clear error for a wrong password", async () => {
    const auth = { signIn: vi.fn().mockRejectedValue(new AstigApiError(400, "UNAUTHENTICATED", "Incorrect username or password.")), completeNewPassword: vi.fn() };
    render(<SignIn auth={auth as never} onSignedIn={() => undefined} />);
    await userEvent.type(screen.getByLabelText("Username"), "x");
    await userEvent.type(screen.getByLabelText("Password"), "y");
    await userEvent.click(screen.getByRole("button", { name: "Sign in" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Incorrect username or password.");
  });
});
