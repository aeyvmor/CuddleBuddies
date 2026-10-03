import { describe, expect, it } from "vitest";
import { AstigApiError, AstigClient, CognitoAuth, memoryTokenStore, newId } from "../src";

type Handler = (url: string, init: RequestInit) => Response | Promise<Response>;
function fake(handler: Handler) {
  const calls: { url: string; init: RequestInit }[] = [];
  const impl = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    return handler(url, init);
  }) as unknown as typeof fetch;
  return { impl, calls };
}
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status });
const noSleep = async () => undefined;
const b64url = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64url");
const idToken = `x.${b64url({ "cognito:groups": ["OFFICER"] })}.y`;

describe("CognitoAuth", () => {
  it("signs in, caches the token, and refreshes before expiry (one refresh for concurrent callers)", async () => {
    let now = 1_000_000;
    let refreshes = 0;
    const f = fake((_u, init) => {
      const body = JSON.parse(init.body as string);
      expect((init.headers as Record<string, string>)["x-amz-target"]).toBe("AWSCognitoIdentityProviderService.InitiateAuth");
      if (body.AuthFlow === "USER_PASSWORD_AUTH") return json(200, { AuthenticationResult: { AccessToken: "a1", IdToken: idToken, RefreshToken: "r1", ExpiresIn: 3600 } });
      refreshes++;
      expect(body.AuthParameters.REFRESH_TOKEN).toBe("r1");
      return json(200, { AuthenticationResult: { AccessToken: "a2", IdToken: idToken, ExpiresIn: 3600 } });
    });
    const auth = new CognitoAuth({ region: "ap-southeast-1", clientId: "c", fetchImpl: f.impl, now: () => now });
    await auth.signIn("demo-officer", "pw");
    expect(await auth.getAccessToken()).toBe("a1");
    expect(await auth.roles()).toEqual(["OFFICER"]);
    now += 3600_000 - 30_000; // within the 60 s refresh window
    const [x, y] = await Promise.all([auth.getAccessToken(), auth.getAccessToken()]);
    expect([x, y]).toEqual(["a2", "a2"]);
    expect(refreshes).toBe(1);
    expect(f.calls[0]!.url).toBe("https://cognito-idp.ap-southeast-1.amazonaws.com/");
  });

  it("surfaces the new-password challenge and wrong passwords clearly", async () => {
    const f = fake((_u, init) => {
      const body = JSON.parse(init.body as string);
      if (body.AuthParameters?.PASSWORD === "bad") return json(400, { __type: "NotAuthorizedException", message: "x" });
      if (body.ChallengeName === "NEW_PASSWORD_REQUIRED") return json(200, { AuthenticationResult: { AccessToken: "a", IdToken: idToken, RefreshToken: "r", ExpiresIn: 3600 } });
      return json(200, { ChallengeName: "NEW_PASSWORD_REQUIRED", Session: "s" });
    });
    const auth = new CognitoAuth({ region: "r", clientId: "c", fetchImpl: f.impl });
    await expect(auth.signIn("u", "bad")).rejects.toMatchObject({ code: "UNAUTHENTICATED", message: "Incorrect username or password." });
    const ch = await auth.signIn("u", "temp");
    expect(ch).toMatchObject({ kind: "NEW_PASSWORD_REQUIRED" });
    await auth.completeNewPassword(ch as any, "NewPassword123");
    expect(await auth.getAccessToken()).toBe("a");
  });

  it("requires sign-in when there is no token", async () => {
    const auth = new CognitoAuth({ region: "r", clientId: "c", store: memoryTokenStore() });
    await expect(auth.getAccessToken()).rejects.toMatchObject({ code: "AUTH_REQUIRED" });
  });
});

describe("AstigClient", () => {
  const client = (handler: Handler, extra: Partial<ConstructorParameters<typeof AstigClient>[0]> = {}) => {
    const f = fake(handler);
    return { c: new AstigClient({ baseUrl: "https://api.test/", getToken: async () => "tok", fetchImpl: f.impl, sleep: noSleep, ...extra }), f };
  };

  it("sends bearer auth and builds list queries", async () => {
    const { c, f } = client(() => json(200, { items: [], nextCursor: null, areaNames: [] }));
    await c.listIssues({ severity: "HIGH", bbox: [120.9, 14.5, 121.1, 14.7], workOrderStatus: "NONE" });
    const u = new URL(f.calls[0]!.url);
    expect(u.pathname).toBe("/issues");
    expect(Object.fromEntries(u.searchParams)).toEqual({ severity: "HIGH", bbox: "120.9,14.5,121.1,14.7", workOrderStatus: "NONE" });
    expect((f.calls[0]!.init.headers as Record<string, string>).authorization).toBe("Bearer tok");
  });

  it("maps the error envelope and does not retry 4xx", async () => {
    const { c, f } = client(() => json(409, { error: { code: "INVALID_TRANSITION", message: "Cannot move", requestId: "r1", details: [{ path: "status", message: "allowed next status: IN_PROGRESS" }] } }));
    const err = await c.updateWorkOrder("w", { status: "RESOLVED" }).catch((e) => e);
    expect(err).toBeInstanceOf(AstigApiError);
    expect(err).toMatchObject({ status: 409, code: "INVALID_TRANSITION", requestId: "r1", retryable: false });
    expect(f.calls).toHaveLength(1);
  });

  it("retries network errors and 5xx/429, then succeeds", async () => {
    let n = 0;
    const { c, f } = client(() => {
      n++;
      if (n === 1) throw new TypeError("fetch failed");
      if (n === 2) return json(503, { message: "Service Unavailable" });
      if (n === 3) return json(429, { message: "Too Many Requests" });
      return json(200, { generatedAt: "x" });
    });
    await c.analyticsSummary();
    expect(f.calls).toHaveLength(4);
  });

  it("calls onUnauthenticated on 401", async () => {
    let called = 0;
    const { c } = client(() => json(401, { message: "Unauthorized" }), { onUnauthenticated: () => void called++ });
    await expect(c.getIssue("i")).rejects.toMatchObject({ status: 401, code: "UNAUTHENTICATED" });
    expect(called).toBe(1);
  });

  it("submitCapture registers, presigns, and PUTs without a manual content-length; ALREADY_UPLOADED counts as done", async () => {
    let uploaded = false;
    const { c, f } = client((url, init) => {
      if (url.startsWith("https://s3.test/")) {
        expect(init.method).toBe("PUT");
        expect(init.headers).toEqual({ "content-type": "image/jpeg" });
        uploaded = true;
        return new Response(null, { status: 200 });
      }
      if (url.endsWith("/observations")) return json(201, { created: true, observation: { id: "o1" } });
      if (url.endsWith("/upload-url")) {
        if (uploaded) return json(409, { error: { code: "ALREADY_UPLOADED", message: "done", requestId: "r" } });
        return json(200, { method: "PUT", url: "https://s3.test/put", headers: { "content-type": "image/jpeg", "content-length": "3" }, expiresAt: "x" });
      }
      return json(404, {});
    });
    const capture = { schemaVersion: "observation-capture.v0", clientObservationId: newId(), sequenceNumber: 0, capturedAt: "2026-10-04T00:00:00.000Z", location: { latitude: 14.6, longitude: 121 }, horizontalAccuracyM: 5, samplingMethod: "GPS_DISTANCE", distanceFromPreviousM: null } as const;
    const image = { data: new Uint8Array([1, 2, 3]), byteLength: 3 };
    expect(await c.submitCapture("s", capture, image)).toEqual({ observationId: "o1", uploaded: "NOW" });
    expect(await c.submitCapture("s", capture, image)).toEqual({ observationId: "o1", uploaded: "ALREADY" });
    expect(f.calls.filter((x) => x.url.startsWith("https://s3.test/"))).toHaveLength(1);
  });
});

describe("newId", () => {
  it("produces RFC 9562 v4 UUIDs", () => {
    expect(newId()).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });
});
