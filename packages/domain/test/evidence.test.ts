import { describe, expect, it } from "vitest";
import { evidenceObjectKey, issueTypeForDetection, parseEvidenceObjectKey } from "../src";

const S = "5e3d0003-0000-4000-8000-000000000001";
const O = "5e3d0005-0000-4000-8000-000000000001";

describe("evidence object keys", () => {
  it("round-trips server-derived keys", () => {
    const key = evidenceObjectKey(S, O);
    expect(key).toBe(`sessions/${S}/observations/${O}.jpg`);
    expect(parseEvidenceObjectKey(key)).toEqual({ sessionId: S, clientObservationId: O });
  });

  it.each([
    `sessions/${S}/observations/${O}.png`,
    `sessions/${S}/observations/${O}.jpg/extra`,
    `other/${S}/observations/${O}.jpg`,
    `sessions/../observations/${O}.jpg`,
    `sessions/${S.toUpperCase()}/observations/${O}.jpg`,
    "",
  ])("rejects keys ASTIG did not issue: %s", (key) => {
    expect(parseEvidenceObjectKey(key)).toBeNull();
  });

  it("refuses non-UUID identifiers", () => {
    expect(() => evidenceObjectKey("../x", O)).toThrow();
  });
});

describe("issueTypeForDetection", () => {
  const base = {
    schemaVersion: "detection.v0" as const,
    obstructionType: "NONE" as const,
    blockagePercent: null,
    severityEstimate: "LOW" as const,
    confidence: 0.5,
    evidenceDescription: "x",
    requiresHumanReview: true,
    modelVersion: "m",
  };
  it("maps visible concrete issues and ignores NONE / not-visible", () => {
    expect(issueTypeForDetection({ ...base, infrastructureVisible: true, issueType: "BLOCKED_DRAIN" })).toBe("BLOCKED_DRAIN");
    expect(issueTypeForDetection({ ...base, infrastructureVisible: true, issueType: "NONE" })).toBeNull();
    expect(issueTypeForDetection({ ...base, infrastructureVisible: false, issueType: "NONE" })).toBeNull();
  });
});
