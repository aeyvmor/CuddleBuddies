import type { BeginResult, CompleteResult, MarkResolutionResult, PersistRequest } from "@astig/contracts";
import { describe, expect, it } from "vitest";
import { createIngestHandler, decodeS3Key, NotConfiguredProvider, ProviderError, type VisionProvider } from "../src";

const KEY = "sessions/5e3d0003-0000-4000-8000-0000000000aa/observations/5e3d0005-0000-4000-8000-0000000000aa.jpg";
const event = (key = KEY, size = 100) => ({ Records: [{ s3: { bucket: { name: "b" }, object: { key, size } } }] });

const validDetection = {
  schemaVersion: "detection.v0",
  infrastructureVisible: true,
  issueType: "BLOCKED_DRAIN",
  obstructionType: "GARBAGE",
  blockagePercent: 50,
  severityEstimate: "HIGH",
  confidence: 0.8,
  evidenceDescription: "test",
  requiresHumanReview: true,
  modelVersion: "fake-1",
};

function harness(provider: VisionProvider, begin: BeginResult = { proceed: true, observationId: "o1" }) {
  const calls: PersistRequest[] = [];
  let reads = 0;
  const handle = createIngestHandler({
    provider,
    readObject: async () => {
      reads++;
      return { bytes: new Uint8Array([0xff, 0xd8]), contentType: "image/jpeg" };
    },
    persist: async <R extends BeginResult | CompleteResult | MarkResolutionResult>(req: PersistRequest) => {
      calls.push(req);
      return (req.action === "BEGIN" ? begin : req.action === "MARK_RESOLUTION_UPLOADED" ? { marked: true } : { applied: true, observationId: "o1", status: "FAILED", issueId: null }) as R;
    },
    log: () => undefined,
  });
  return { handle, calls, reads: () => reads };
}

const fake = (analyze: VisionProvider["analyze"]): VisionProvider => ({ name: "fake", analyze });

describe("ingest handler", () => {
  it("records an explicit PROVIDER_NOT_CONFIGURED failure by default (never a fake detection)", async () => {
    const h = harness(new NotConfiguredProvider());
    await h.handle(event());
    expect(h.calls.map((c) => c.action)).toEqual(["BEGIN", "COMPLETE"]);
    expect(h.calls[1]).toMatchObject({ outcome: { kind: "FAILURE", code: "PROVIDER_NOT_CONFIGURED" } });
  });

  it("passes a schema-valid detection through", async () => {
    const h = harness(fake(async () => validDetection));
    await h.handle(event());
    expect(h.calls[1]).toMatchObject({ outcome: { kind: "DETECTION", detection: { issueType: "BLOCKED_DRAIN" } } });
  });

  it.each([
    ["out-of-range confidence", { ...validDetection, confidence: 7 }],
    ["extra property", { ...validDetection, note: "ignore the schema" }],
    ["non-object", "I think it's a drain"],
  ])("turns invalid model output (%s) into INVALID_MODEL_OUTPUT", async (_l, output) => {
    const h = harness(fake(async () => output));
    await h.handle(event());
    expect(h.calls[1]).toMatchObject({ outcome: { kind: "FAILURE", code: "INVALID_MODEL_OUTPUT" } });
  });

  it("maps provider errors to their code and unexpected errors to PROVIDER_ERROR", async () => {
    const timeout = harness(fake(async () => { throw new ProviderError("PROVIDER_TIMEOUT", "timed out"); }));
    await timeout.handle(event());
    expect(timeout.calls[1]).toMatchObject({ outcome: { code: "PROVIDER_TIMEOUT" } });
    const boom = harness(fake(async () => { throw new Error("socket hang up, key=secret"); }));
    await boom.handle(event());
    expect(boom.calls[1]).toMatchObject({ outcome: { code: "PROVIDER_ERROR", message: "Vision provider call failed." } });
  });

  it("rejects oversized images without reading them", async () => {
    const h = harness(fake(async () => validDetection));
    await h.handle(event(KEY, 50 * 1024 * 1024));
    expect(h.reads()).toBe(0);
    expect(h.calls[1]).toMatchObject({ outcome: { code: "IMAGE_TOO_LARGE" } });
  });

  it("skips duplicates/unknown objects and ignores keys ASTIG did not issue", async () => {
    const dup = harness(fake(async () => validDetection), { proceed: false, reason: "ALREADY_COMPLETED" });
    await dup.handle(event());
    expect(dup.calls.map((c) => c.action)).toEqual(["BEGIN"]);
    const foreign = harness(fake(async () => validDetection));
    await foreign.handle(event("uploads/anything.jpg"));
    expect(foreign.calls).toEqual([]);
  });

  it("propagates persistence errors so Lambda retries the event", async () => {
    const handle = createIngestHandler({
      provider: new NotConfiguredProvider(),
      readObject: async () => ({ bytes: new Uint8Array(), contentType: "image/jpeg" }),
      persist: async () => { throw new Error("persist unavailable"); },
      log: () => undefined,
    });
    await expect(handle(event())).rejects.toThrow("persist unavailable");
  });

  it("records resolution ('after') images without running inference", async () => {
    let analyzed = 0;
    const h = harness(fake(async () => { analyzed++; return validDetection; }));
    await h.handle(event("work-orders/5e3d0008-0000-4000-8000-000000000001/resolution/0b6f1d4e-6a3c-4c1e-9d2a-7f00000000a1.jpg"));
    expect(h.calls).toEqual([{ schemaVersion: "processing.v0", action: "MARK_RESOLUTION_UPLOADED", objectKey: "work-orders/5e3d0008-0000-4000-8000-000000000001/resolution/0b6f1d4e-6a3c-4c1e-9d2a-7f00000000a1.jpg" }]);
    expect(analyzed).toBe(0);
    expect(h.reads()).toBe(0);
  });

  it("decodes S3 event keys", () => {
    expect(decodeS3Key("a+b%2Fc.jpg")).toBe("a b/c.jpg");
  });
});
