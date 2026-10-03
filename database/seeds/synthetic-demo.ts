/**
 * Deterministic SYNTHETIC demo dataset. Every row is marked is_synthetic = true.
 * - Fixed UUIDs and UTC timestamps so every reset yields identical data.
 * - Coordinates are on public roads around a public park in Quezon City (pilot-area placeholder),
 *   not private residences.
 * - Subjects ("demo-operator-01", "demo-officer-01") are fake identities; no personal data.
 * - No images are committed. Completed observations reference server-derived S3 keys; upload only
 *   team-approved synthetic images to those keys for the demo.
 */
import type { Detection, IssueType, SamplingMethod } from "@astig/contracts";

const id = (entity: number, n: number): string =>
  `5e3d${entity.toString(16).padStart(4, "0")}-0000-4000-8000-${n.toString(16).padStart(12, "0")}`;

export const SEED = {
  deviceId: id(1, 1),
  vehicleId: id(2, 1),
  operatorSubject: "demo-operator-01",
  officerSubject: "demo-officer-01",
} as const;

export const SEED_SESSIONS = [
  { id: id(3, 1), startedAt: "2026-09-28T00:30:00.000Z", endedAt: "2026-09-28T01:30:00.000Z", start: { latitude: 14.651, longitude: 121.045 } },
  { id: id(3, 2), startedAt: "2026-10-01T00:30:00.000Z", endedAt: "2026-10-01T01:20:00.000Z", start: { latitude: 14.651, longitude: 121.045 } },
] as const;

export interface SeedIssue {
  id: string;
  issueType: Exclude<IssueType, "NONE">;
  status: "OPEN" | "RESOLVED";
  location: { latitude: number; longitude: number };
  locationUncertaintyM: number;
  areaName: string;
  roadName: string;
  riskAssessmentId: string;
  /** Synthetic exposure input (0–100) or null for UNKNOWN. Clearly labeled as a demo assumption. */
  syntheticExposure: number | null;
}

export const SEED_ISSUES: SeedIssue[] = [
  {
    id: id(4, 1), issueType: "BLOCKED_DRAIN", status: "OPEN",
    location: { latitude: 14.65275, longitude: 121.04756 }, locationUncertaintyM: 8,
    areaName: "Demo Area A (synthetic)", roadName: "Elliptical Road",
    riskAssessmentId: id(7, 1), syntheticExposure: 60,
  },
  {
    id: id(4, 2), issueType: "STANDING_WATER", status: "OPEN",
    location: { latitude: 14.64898, longitude: 121.05115 }, locationUncertaintyM: 10,
    areaName: "Demo Area A (synthetic)", roadName: "Elliptical Road",
    riskAssessmentId: id(7, 2), syntheticExposure: null,
  },
  {
    id: id(4, 3), issueType: "ROAD_DAMAGE", status: "RESOLVED",
    location: { latitude: 14.6542, longitude: 121.0523 }, locationUncertaintyM: 12,
    areaName: "Demo Area A (synthetic)", roadName: "Elliptical Road",
    riskAssessmentId: id(7, 3), syntheticExposure: null,
  },
];

export interface SeedObservation {
  id: string;
  clientObservationId: string;
  sessionId: string;
  issueId: string | null;
  sequenceNumber: number;
  capturedAt: string;
  location: { latitude: number; longitude: number };
  horizontalAccuracyM: number | null;
  samplingMethod: SamplingMethod;
  distanceFromPreviousM: number | null;
  processing:
    | { status: "COMPLETED"; detection: Detection }
    | { status: "FAILED"; errorCode: string; errorMessage: string; attempts: number }
    | { status: "PENDING" };
}

const det = (d: Omit<Detection, "schemaVersion" | "modelVersion" | "requiresHumanReview"> & { requiresHumanReview?: boolean }): Detection => ({
  schemaVersion: "detection.v0",
  modelVersion: "synthetic-seed-v0",
  requiresHumanReview: d.requiresHumanReview ?? true,
  ...d,
});

const [S1, S2] = [SEED_SESSIONS[0].id, SEED_SESSIONS[1].id];
const [I1, I2, I3] = [SEED_ISSUES[0]!.id, SEED_ISSUES[1]!.id, SEED_ISSUES[2]!.id];

export const SEED_OBSERVATIONS: SeedObservation[] = [
  {
    id: id(6, 1), clientObservationId: id(5, 1), sessionId: S1, issueId: I1, sequenceNumber: 12,
    capturedAt: "2026-09-28T00:41:10.000Z", location: { latitude: 14.65277, longitude: 121.04752 },
    horizontalAccuracyM: 6, samplingMethod: "GPS_DISTANCE", distanceFromPreviousM: 7.1,
    processing: { status: "COMPLETED", detection: det({ infrastructureVisible: true, issueType: "BLOCKED_DRAIN", obstructionType: "GARBAGE", blockagePercent: 40, severityEstimate: "MODERATE", confidence: 0.74, evidenceDescription: "SYNTHETIC: curbside drain inlet partly covered by plastic waste." }) },
  },
  {
    id: id(6, 2), clientObservationId: id(5, 2), sessionId: S2, issueId: I1, sequenceNumber: 9,
    capturedAt: "2026-10-01T00:38:40.000Z", location: { latitude: 14.65273, longitude: 121.0476 },
    horizontalAccuracyM: 4.8, samplingMethod: "GPS_DISTANCE", distanceFromPreviousM: 7.4,
    processing: { status: "COMPLETED", detection: det({ infrastructureVisible: true, issueType: "BLOCKED_DRAIN", obstructionType: "GARBAGE", blockagePercent: 65, severityEstimate: "HIGH", confidence: 0.83, evidenceDescription: "SYNTHETIC: same inlet, more waste accumulated over the grate." }) },
  },
  {
    id: id(6, 3), clientObservationId: id(5, 3), sessionId: S2, issueId: I1, sequenceNumber: 10,
    capturedAt: "2026-10-01T00:38:42.000Z", location: { latitude: 14.65278, longitude: 121.04754 },
    horizontalAccuracyM: 5.1, samplingMethod: "GPS_DISTANCE", distanceFromPreviousM: 6.9,
    processing: { status: "COMPLETED", detection: det({ infrastructureVisible: true, issueType: "BLOCKED_DRAIN", obstructionType: "GARBAGE", blockagePercent: 70, severityEstimate: "HIGH", confidence: 0.79, evidenceDescription: "SYNTHETIC: grate mostly obstructed; adjacent frame confirms blockage." }) },
  },
  {
    id: id(6, 4), clientObservationId: id(5, 4), sessionId: S2, issueId: I2, sequenceNumber: 21,
    capturedAt: "2026-10-01T00:52:05.000Z", location: { latitude: 14.649, longitude: 121.05112 },
    horizontalAccuracyM: 7.5, samplingMethod: "GPS_DISTANCE", distanceFromPreviousM: 7.2,
    processing: { status: "COMPLETED", detection: det({ infrastructureVisible: true, issueType: "STANDING_WATER", obstructionType: "NONE", blockagePercent: null, severityEstimate: "MODERATE", confidence: 0.66, evidenceDescription: "SYNTHETIC: standing water across the outer lane near the curb." }) },
  },
  {
    id: id(6, 5), clientObservationId: id(5, 5), sessionId: S1, issueId: I3, sequenceNumber: 30,
    capturedAt: "2026-09-28T01:05:30.000Z", location: { latitude: 14.65418, longitude: 121.05233 },
    horizontalAccuracyM: 9, samplingMethod: "GPS_DISTANCE", distanceFromPreviousM: 7,
    processing: { status: "COMPLETED", detection: det({ infrastructureVisible: true, issueType: "ROAD_DAMAGE", obstructionType: "NONE", blockagePercent: null, severityEstimate: "LOW", confidence: 0.7, requiresHumanReview: false, evidenceDescription: "SYNTHETIC: small pothole at lane edge." }) },
  },
  {
    // Explicit processing failure: kept as evidence, never converted into a detection.
    id: id(6, 6), clientObservationId: id(5, 6), sessionId: S2, issueId: null, sequenceNumber: 22,
    capturedAt: "2026-10-01T00:52:55.000Z", location: { latitude: 14.64931, longitude: 121.05151 },
    horizontalAccuracyM: 6.2, samplingMethod: "GPS_DISTANCE", distanceFromPreviousM: 7.3,
    processing: { status: "FAILED", errorCode: "PROVIDER_TIMEOUT", errorMessage: "SYNTHETIC: vision provider timed out; eligible for retry.", attempts: 1 },
  },
  {
    id: id(6, 7), clientObservationId: id(5, 7), sessionId: S2, issueId: null, sequenceNumber: 23,
    capturedAt: "2026-10-01T00:53:40.000Z", location: { latitude: 14.64962, longitude: 121.05186 },
    horizontalAccuracyM: null, samplingMethod: "GPS_DISTANCE", distanceFromPreviousM: 7.6,
    processing: { status: "PENDING" },
  },
];

export interface SeedWorkOrder {
  id: string;
  idempotencyKey: string;
  issueId: string;
  riskAssessmentId: string;
  status: "OPEN" | "IN_PROGRESS" | "RESOLVED";
  assignedTeam: string;
  notes: string;
  createdAt: string;
  startedAt: string | null;
  resolvedAt: string | null;
}

export const SEED_WORK_ORDERS: SeedWorkOrder[] = [
  {
    id: id(8, 1), idempotencyKey: id(9, 1), issueId: I2, riskAssessmentId: SEED_ISSUES[1]!.riskAssessmentId,
    status: "OPEN", assignedTeam: "Synthetic Drainage Maintenance Team", notes: "SYNTHETIC: inspect inlet capacity.",
    createdAt: "2026-10-01T03:00:00.000Z", startedAt: null, resolvedAt: null,
  },
  {
    id: id(8, 2), idempotencyKey: id(9, 2), issueId: I3, riskAssessmentId: SEED_ISSUES[2]!.riskAssessmentId,
    status: "RESOLVED", assignedTeam: "Synthetic Road Maintenance Team", notes: "SYNTHETIC: pothole patched.",
    createdAt: "2026-09-28T05:00:00.000Z", startedAt: "2026-09-29T01:00:00.000Z", resolvedAt: "2026-09-30T08:00:00.000Z",
  },
];
