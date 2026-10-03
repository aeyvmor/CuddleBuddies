import { Detection } from "@astig/contracts";
import { describe, expect, it } from "vitest";
import { GEMINI_RESPONSE_SCHEMA, GeminiProvider, ProviderError, providerFromEnv } from "../src";

const fields = {
  infrastructureVisible: true,
  issueType: "BLOCKED_DRAIN",
  obstructionType: "GARBAGE",
  blockagePercent: 55,
  severityEstimate: "HIGH",
  confidence: 0.77,
  evidenceDescription: "Curb inlet partly covered by plastic bags.",
  requiresHumanReview: true,
};
const image = { image: new Uint8Array([0xff, 0xd8, 0xff]), contentType: "image/jpeg" };

function fakeFetch(respond: (url: string, init: RequestInit) => Response | Promise<Response>) {
  const calls: { url: string; init: RequestInit }[] = [];
  const impl = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    return respond(url, init);
  }) as unknown as typeof fetch;
  return { impl, calls };
}
const ok = (text: string) =>
  new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text }] }, finishReason: "STOP" }] }), { status: 200 });
const provider = (impl: typeof fetch, key = "test-key") => new GeminiProvider({ getApiKey: async () => key, fetchImpl: impl, model: "gemini-test" });

async function code(p: Promise<unknown>): Promise<string> {
  try {
    await p;
  } catch (e) {
    expect(e).toBeInstanceOf(ProviderError);
    return (e as ProviderError).code;
  }
  throw new Error("expected ProviderError");
}

describe("GeminiProvider", () => {
  it("sends the image, prompt, and JSON schema with the key in a header (not the URL)", async () => {
    const f = fakeFetch(() => ok(JSON.stringify(fields)));
    await provider(f.impl).analyze(image);
    const { url, init } = f.calls[0]!;
    expect(url).toBe("https://generativelanguage.googleapis.com/v1beta/models/gemini-test:generateContent");
    expect(url).not.toContain("test-key");
    expect((init.headers as Record<string, string>)["x-goog-api-key"]).toBe("test-key");
    const body = JSON.parse(init.body as string);
    expect(body.contents[0].parts[1].inlineData).toEqual({ mimeType: "image/jpeg", data: "/9j/" });
    expect(body.generationConfig.responseFormat.text).toEqual({ mimeType: "application/json", schema: GEMINI_RESPONSE_SCHEMA });
  });

  it("returns output that passes the shared Detection schema, with server-set versions", async () => {
    const f = fakeFetch(() => ok(JSON.stringify({ ...fields, modelVersion: "spoofed", schemaVersion: "x" })));
    const out = await provider(f.impl).analyze(image);
    const parsed = Detection.parse(out);
    expect(parsed.modelVersion).toBe("gemini:gemini-test");
    expect(parsed.schemaVersion).toBe("detection.v0");
  });

  it("keeps unexpected model fields so strict validation rejects them", async () => {
    const f = fakeFetch(() => ok(JSON.stringify({ ...fields, dispatchCrew: true })));
    expect(Detection.safeParse(await provider(f.impl).analyze(image)).success).toBe(false);
  });

  it.each([
    ["key not configured", () => provider(fakeFetch(() => ok("{}")).impl, "NOT_CONFIGURED"), "PROVIDER_NOT_CONFIGURED"],
    ["HTTP 429", () => provider(fakeFetch(() => new Response("quota", { status: 429 })).impl), "PROVIDER_ERROR"],
    ["non-JSON body", () => provider(fakeFetch(() => new Response("<html>", { status: 200 })).impl), "INVALID_MODEL_OUTPUT"],
    ["safety block / no candidate", () => provider(fakeFetch(() => new Response(JSON.stringify({ promptFeedback: { blockReason: "SAFETY" } }), { status: 200 })).impl), "INVALID_MODEL_OUTPUT"],
    ["text not JSON", () => provider(fakeFetch(() => ok("I see a drain")).impl), "INVALID_MODEL_OUTPUT"],
    ["JSON array", () => provider(fakeFetch(() => ok("[1,2]")).impl), "INVALID_MODEL_OUTPUT"],
    ["network failure", () => provider(fakeFetch(() => { throw new TypeError("fetch failed"); }).impl), "PROVIDER_ERROR"],
    ["timeout", () => provider(fakeFetch(() => { throw Object.assign(new Error("t"), { name: "TimeoutError" }); }).impl), "PROVIDER_TIMEOUT"],
  ])("maps %s to an explicit failure code", async (_l, make, expected) => {
    expect(await code(make().analyze(image))).toBe(expected);
  });

  it("rejects non-JPEG evidence without calling Gemini", async () => {
    const f = fakeFetch(() => ok("{}"));
    expect(await code(provider(f.impl).analyze({ image: new Uint8Array(), contentType: "image/png" }))).toBe("IMAGE_UNREADABLE");
    expect(f.calls).toHaveLength(0);
  });

  it("is selected by VISION_PROVIDER, and unknown providers fail loudly", () => {
    const factories = { gemini: () => provider(fakeFetch(() => ok("{}")).impl) };
    expect(providerFromEnv({ VISION_PROVIDER: "gemini" }, factories).name).toBe("gemini");
    expect(providerFromEnv({}, factories).name).toBe("none");
    expect(() => providerFromEnv({ VISION_PROVIDER: "magic" }, factories)).toThrow(/Unknown VISION_PROVIDER/);
  });
});
