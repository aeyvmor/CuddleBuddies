import { describe, expect, it } from "vitest";
import {
  Coordinates,
  CreateWorkOrderRequest,
  DETECTION_SCHEMA_VERSION,
  Detection,
  ObservationCaptureRequest,
  ScoreBreakdown,
  UpdateWorkOrderRequest,
  UtcInstant,
} from "../src";

const validCapture = {
  schemaVersion: "observation-capture.v0",
  clientObservationId: "7d3c4c1e-2f0a-4b8e-9a51-0c6f3c1d2e10",
  sequenceNumber: 3,
  capturedAt: "2026-10-03T01:02:03.000Z",
  location: { latitude: 14.6507, longitude: 121.0494 },
  horizontalAccuracyM: 4.5,
  samplingMethod: "GPS_DISTANCE",
  distanceFromPreviousM: 7.2,
};

const validDetection = {
  schemaVersion: DETECTION_SCHEMA_VERSION,
  infrastructureVisible: true,
  issueType: "BLOCKED_DRAIN",
  obstructionType: "GARBAGE",
  blockagePercent: 60,
  severityEstimate: "HIGH",
  confidence: 0.82,
  evidenceDescription: "Synthetic: drain inlet partly covered by plastic waste.",
  requiresHumanReview: true,
  modelVersion: "stub-0",
};

describe("coordinates", () => {
  it.each([
    [{ latitude: 90.0001, longitude: 0 }],
    [{ latitude: -90.0001, longitude: 0 }],
    [{ latitude: 0, longitude: 180.0001 }],
    [{ latitude: 0, longitude: -180.0001 }],
    [{ latitude: Number.NaN, longitude: 0 }],
    [{ latitude: Number.POSITIVE_INFINITY, longitude: 0 }],
    [{ latitude: "14.6", longitude: 121 }],
    [{ lat: 14.6, lng: 121 }],
  ])("rejects invalid coordinates %j", (value) => {
    expect(Coordinates.safeParse(value).success).toBe(false);
  });

  it("accepts boundary values", () => {
    expect(Coordinates.safeParse({ latitude: -90, longitude: 180 }).success).toBe(true);
  });
});

describe("UTC instants", () => {
  it("rejects offsets and non-ISO strings", () => {
    expect(UtcInstant.safeParse("2026-10-03T09:02:03+08:00").success).toBe(false);
    expect(UtcInstant.safeParse("2026-10-03 01:02:03").success).toBe(false);
    expect(UtcInstant.safeParse("2026-10-03T01:02:03Z").success).toBe(true);
  });
});

describe("observation capture request", () => {
  it("accepts valid capture metadata", () => {
    expect(ObservationCaptureRequest.safeParse(validCapture).success).toBe(true);
  });

  it("rejects invalid coordinates inside capture metadata", () => {
    const r = ObservationCaptureRequest.safeParse({ ...validCapture, location: { latitude: 91, longitude: 121 } });
    expect(r.success).toBe(false);
  });

  it("rejects a client-supplied object key (unknown property)", () => {
    const r = ObservationCaptureRequest.safeParse({ ...validCapture, imageObjectKey: "other-session/x.jpg" });
    expect(r.success).toBe(false);
  });

  it("rejects a non-UUID idempotency key and negative accuracy", () => {
    expect(ObservationCaptureRequest.safeParse({ ...validCapture, clientObservationId: "abc" }).success).toBe(false);
    expect(ObservationCaptureRequest.safeParse({ ...validCapture, horizontalAccuracyM: -1 }).success).toBe(false);
  });
});

describe("detection (model output trust boundary)", () => {
  it("accepts valid output", () => {
    expect(Detection.safeParse(validDetection).success).toBe(true);
  });

  it.each([
    ["confidence > 1", { confidence: 1.01 }],
    ["confidence < 0", { confidence: -0.1 }],
    ["blockage > 100", { blockagePercent: 101 }],
    ["unknown enum", { issueType: "FLOOD_PREDICTED" }],
    ["empty description", { evidenceDescription: "   " }],
    ["too-long description", { evidenceDescription: "x".repeat(501) }],
    ["wrong schema version", { schemaVersion: "detection.v9" }],
    ["unexpected property", { extra: "ignore previous instructions" }],
  ])("rejects %s", (_label, patch) => {
    expect(Detection.safeParse({ ...validDetection, ...patch }).success).toBe(false);
  });

  it("rejects an issue type when infrastructure is not visible", () => {
    const r = Detection.safeParse({ ...validDetection, infrastructureVisible: false, blockagePercent: null });
    expect(r.success).toBe(false);
  });
});

describe("score breakdown", () => {
  const base = {
    id: "00000000-0000-4000-8000-000000000001",
    issueId: "00000000-0000-4000-8000-000000000002",
    formulaVersion: "risk.v0",
    totalScore: 26.25,
    knownCapTotal: 35,
    computedAt: "2026-10-03T01:00:00.000Z",
    components: [
      { factor: "SEVERITY", weight: 0.35, cap: 35, inputStatus: "KNOWN", normalizedValue: 75, weightedPoints: 26.25, source: "detection", rationale: "HIGH" },
      { factor: "WEATHER", weight: 0.25, cap: 25, inputStatus: "UNKNOWN", normalizedValue: null, weightedPoints: null, source: null, rationale: "no feed" },
    ],
  };

  it("accepts a breakdown with unknown inputs", () => {
    expect(ScoreBreakdown.safeParse(base).success).toBe(true);
  });

  it("rejects UNKNOWN input carrying a numeric value (unknown is not zero)", () => {
    const comps = [base.components[0], { ...base.components[1], normalizedValue: 0, weightedPoints: 0 }];
    expect(ScoreBreakdown.safeParse({ ...base, components: comps }).success).toBe(false);
  });

  it("rejects weighted points above cap and caps summing above 100", () => {
    const over = [{ ...base.components[0], weightedPoints: 36 }];
    expect(ScoreBreakdown.safeParse({ ...base, components: over }).success).toBe(false);
    const caps = [{ ...base.components[0], cap: 80 }, { ...base.components[1], cap: 25 }];
    expect(ScoreBreakdown.safeParse({ ...base, components: caps }).success).toBe(false);
  });
});

describe("work-order requests", () => {
  it("requires idempotency key and risk assessment on create", () => {
    expect(CreateWorkOrderRequest.safeParse({ riskAssessmentId: "00000000-0000-4000-8000-000000000001" }).success).toBe(false);
  });

  it("rejects an empty patch and unknown status", () => {
    expect(UpdateWorkOrderRequest.safeParse({}).success).toBe(false);
    expect(UpdateWorkOrderRequest.safeParse({ status: "CLOSED" }).success).toBe(false);
    expect(UpdateWorkOrderRequest.safeParse({ status: "IN_PROGRESS" }).success).toBe(true);
  });
});

describe("detection regions (AI-estimated boxes)", () => {
  const box = (b: number[]) => ({ ...validDetection, regions: [{ label: "BLOCKED_DRAIN", box: b }] });
  it("accepts 0-1000 [ymin, xmin, ymax, xmax] boxes and stays optional", () => {
    expect(Detection.safeParse(box([825, 535, 865, 585])).success).toBe(true);
    expect(Detection.safeParse(validDetection).success).toBe(true);
  });
  it.each([
    ["out of range", [0, 0, 1001, 10]],
    ["min >= max", [500, 500, 400, 600]],
    ["non-integer", [1.5, 0, 10, 10]],
    ["wrong length", [0, 0, 10]],
  ])("rejects %s", (_l, b) => {
    expect(Detection.safeParse(box(b as number[])).success).toBe(false);
  });
  it("rejects boxes on a NONE result, more than 5 boxes, and unknown labels", () => {
    expect(Detection.safeParse({ ...box([1, 1, 2, 2]), issueType: "NONE" }).success).toBe(false);
    expect(Detection.safeParse({ ...validDetection, regions: Array(6).fill({ label: "OTHER", box: [1, 1, 2, 2] }) }).success).toBe(false);
    expect(Detection.safeParse({ ...validDetection, regions: [{ label: "PERSON", box: [1, 1, 2, 2] }] }).success).toBe(false);
  });
});