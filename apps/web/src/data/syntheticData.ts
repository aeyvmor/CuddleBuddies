import {
  DETECTION_SCHEMA_VERSION,
  ISSUE_DETAIL_SCHEMA_VERSION,
  RISK_FORMULA_VERSION,
  type Detection,
  type IssueDetailResponse,
  type IssueObservation,
  type RiskFactor,
  type ScoreBreakdown,
  type ScoreComponent,
  type WorkOrder,
} from "@astig/contracts";

/**
 * SYNTHETIC DEMO DATA. Not captured from real roads; no real imagery or people.
 * Every record has isSynthetic: true. Coordinates are placeholders; the real demo
 * area is still a team decision (docs/operations/privacy-and-demo-data.md).
 *
 * Shapes are the contract's IssueDetailResponse (tests parse every record with
 * the Zod schema). Scores follow the documented risk.v0 arithmetic
 * (weightedPoints = normalizedValue x weight) but are hand-picked inputs, not
 * output of the backend scorer.
 */

/** Stable synthetic UUIDs (v4 layout). The final group identifies the record. */
const id = (kind: number, n: number) => `5e000000-0000-4000-8000-${String(kind).padStart(4, "0")}${String(n).padStart(8, "0")}`;
const ISSUE = 1;
const OBS = 2;
const RISK = 3;
const WO = 4;
const SESSION = 5;

export const SYNTHETIC_ISSUE_IDS = [1, 2, 3, 4].map((n) => id(ISSUE, n));

const FACTORS: { factor: RiskFactor; weight: number; cap: number }[] = [
  { factor: "SEVERITY", weight: 0.35, cap: 35 },
  { factor: "WEATHER", weight: 0.25, cap: 25 },
  { factor: "RECURRENCE", weight: 0.2, cap: 20 },
  { factor: "HAZARD", weight: 0.1, cap: 10 },
  { factor: "EXPOSURE", weight: 0.1, cap: 10 },
];

/** normalized: 0..100 for KNOWN inputs; omitted factors are UNKNOWN. */
function risk(n: number, issueId: string, normalized: Partial<Record<RiskFactor, number>>): ScoreBreakdown {
  const components: ScoreComponent[] = FACTORS.map(({ factor, weight, cap }) => {
    const v = normalized[factor];
    return v === undefined
      ? { factor, weight, cap, source: null, rationale: "Synthetic: input not available.", inputStatus: "UNKNOWN", normalizedValue: null, weightedPoints: null }
      : {
          factor,
          weight,
          cap,
          source: "synthetic-seed",
          rationale: `Synthetic: normalized input ${v}.`,
          inputStatus: "KNOWN",
          normalizedValue: v,
          weightedPoints: Math.min(v * weight, cap),
        };
  });
  const round = (x: number) => Math.round(x * 100) / 100;
  return {
    id: id(RISK, n),
    issueId,
    formulaVersion: RISK_FORMULA_VERSION,
    totalScore: round(components.reduce((s, c) => s + (c.weightedPoints ?? 0), 0)),
    knownCapTotal: components.reduce((s, c) => s + (c.inputStatus === "KNOWN" ? c.cap : 0), 0),
    computedAt: "2026-10-03T01:45:00Z",
    components,
  };
}

function detection(d: Pick<Detection, "issueType" | "severityEstimate" | "evidenceDescription"> & Partial<Detection>): Detection {
  return {
    schemaVersion: DETECTION_SCHEMA_VERSION,
    infrastructureVisible: true,
    obstructionType: "NONE",
    blockagePercent: null,
    confidence: 0.8,
    requiresHumanReview: true,
    modelVersion: "synthetic-demo",
    ...d,
  };
}

function obs(n: number, minute: number, lat: number, lon: number, det: Detection | null, extra: Partial<IssueObservation> = {}): IssueObservation {
  return {
    id: id(OBS, n),
    sessionId: id(SESSION, 1),
    capturedAt: `2026-10-03T01:${String(minute).padStart(2, "0")}:00Z`,
    location: { latitude: lat, longitude: lon },
    horizontalAccuracyM: 8,
    samplingMethod: "GPS_DISTANCE",
    processingStatus: det ? "COMPLETED" : "FAILED",
    processingError: det ? null : { code: "PROVIDER_UNAVAILABLE", message: "Synthetic: the vision provider was unavailable." },
    isSynthetic: true,
    detection: det,
    evidence: { status: "UNAVAILABLE", reason: "NOT_UPLOADED" },
    ...extra,
  };
}

function workOrder(n: number, issueId: string, riskId: string, w: Pick<WorkOrder, "status" | "assignedTeam"> & Partial<WorkOrder>): WorkOrder {
  return {
    id: id(WO, n),
    issueId,
    riskAssessmentId: riskId,
    notes: "Synthetic work order.",
    createdBySubject: "synthetic-officer",
    createdAt: "2026-10-03T02:00:00Z",
    updatedAt: "2026-10-03T03:00:00Z",
    startedAt: null,
    resolvedAt: null,
    version: 1,
    ...w,
  };
}

export function createSyntheticIssues(): IssueDetailResponse[] {
  const [i1, i2, i3, i4] = SYNTHETIC_ISSUE_IDS as [string, string, string, string];
  const r2 = risk(2, i2, { SEVERITY: 100, RECURRENCE: 0, HAZARD: 80, EXPOSURE: 90 });
  const r4 = risk(4, i4, { SEVERITY: 50, WEATHER: 40, RECURRENCE: 0, HAZARD: 40, EXPOSURE: 50 });
  return [
    {
      schemaVersion: ISSUE_DETAIL_SCHEMA_VERSION,
      issue: {
        id: i1,
        issueType: "BLOCKED_DRAIN",
        status: "OPEN",
        location: { latitude: 14.5995, longitude: 120.9842 },
        locationUncertaintyM: 10,
        areaName: "Demo Zone A",
        roadName: "Demo Road 1",
        firstObservedAt: "2026-10-03T01:05:00Z",
        lastObservedAt: "2026-10-03T01:09:00Z",
        observationCount: 2,
        isSynthetic: true,
      },
      riskAssessment: risk(1, i1, { SEVERITY: 75, RECURRENCE: 25, EXPOSURE: 60 }),
      observations: [
        obs(2, 9, 14.59952, 120.98422, null),
        obs(
          1,
          5,
          14.5995,
          120.9842,
          detection({
            issueType: "BLOCKED_DRAIN",
            severityEstimate: "HIGH",
            obstructionType: "DEBRIS",
            blockagePercent: 70,
            confidence: 0.86,
            evidenceDescription: "Synthetic: grate appears mostly covered by debris.",
          }),
        ),
      ],
      observationsTruncated: false,
      workOrders: [],
    },
    {
      schemaVersion: ISSUE_DETAIL_SCHEMA_VERSION,
      issue: {
        id: i2,
        issueType: "STANDING_WATER",
        status: "OPEN",
        location: { latitude: 14.6021, longitude: 120.9875 },
        locationUncertaintyM: 15,
        areaName: "Demo Zone B",
        roadName: null,
        firstObservedAt: "2026-10-03T01:20:00Z",
        lastObservedAt: "2026-10-03T01:20:00Z",
        observationCount: 1,
        isSynthetic: true,
      },
      riskAssessment: r2,
      observations: [
        obs(
          3,
          20,
          14.6021,
          120.9875,
          detection({
            issueType: "STANDING_WATER",
            severityEstimate: "CRITICAL",
            obstructionType: "NONE",
            confidence: 0.55,
            evidenceDescription: "Synthetic: ponding across the lane.",
          }),
        ),
      ],
      observationsTruncated: false,
      workOrders: [
        workOrder(1, i2, r2.id, { status: "IN_PROGRESS", assignedTeam: "Demo Drainage Team 1", startedAt: "2026-10-03T03:00:00Z", version: 2 }),
      ],
    },
    {
      schemaVersion: ISSUE_DETAIL_SCHEMA_VERSION,
      issue: {
        id: i3,
        issueType: "DAMAGED_DRAIN",
        status: "OPEN",
        location: { latitude: 14.6008, longitude: 120.9811 },
        locationUncertaintyM: 10,
        areaName: "Demo Zone A",
        roadName: "Demo Road 2",
        firstObservedAt: "2026-10-03T01:31:00Z",
        lastObservedAt: "2026-10-03T01:31:00Z",
        observationCount: 1,
        isSynthetic: true,
      },
      riskAssessment: risk(3, i3, { SEVERITY: 25, RECURRENCE: 0, EXPOSURE: 30 }),
      observations: [
        obs(
          4,
          31,
          14.6008,
          120.9811,
          detection({
            issueType: "DAMAGED_DRAIN",
            severityEstimate: "LOW",
            obstructionType: "NONE",
            confidence: 0.92,
            requiresHumanReview: false,
            evidenceDescription: "Synthetic: small crack along the drain edge.",
          }),
        ),
      ],
      observationsTruncated: false,
      workOrders: [],
    },
    {
      schemaVersion: ISSUE_DETAIL_SCHEMA_VERSION,
      issue: {
        id: i4,
        issueType: "ROAD_DAMAGE",
        status: "RESOLVED",
        location: { latitude: 14.5968, longitude: 120.9899 },
        locationUncertaintyM: null,
        areaName: "Demo Zone C",
        roadName: "Demo Road 3",
        firstObservedAt: "2026-10-02T01:40:00Z",
        lastObservedAt: "2026-10-02T01:40:00Z",
        observationCount: 1,
        isSynthetic: true,
      },
      riskAssessment: r4,
      observations: [
        obs(
          5,
          40,
          14.5968,
          120.9899,
          detection({
            issueType: "ROAD_DAMAGE",
            severityEstimate: "MODERATE",
            confidence: 0.74,
            evidenceDescription: "Synthetic: surface cracking.",
          }),
          { horizontalAccuracyM: null, capturedAt: "2026-10-02T01:40:00Z" },
        ),
      ],
      observationsTruncated: false,
      workOrders: [
        workOrder(2, i4, r4.id, {
          status: "RESOLVED",
          assignedTeam: "Demo Roads Team 2",
          createdAt: "2026-10-02T02:00:00Z",
          updatedAt: "2026-10-02T06:00:00Z",
          startedAt: "2026-10-02T03:00:00Z",
          resolvedAt: "2026-10-02T06:00:00Z",
          version: 3,
        }),
      ],
    },
  ];
}
