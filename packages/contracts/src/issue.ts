import { z } from "zod";
import { Coordinates, NullableMetres, Uuid, UtcInstant } from "./common";
import { Detection, IssueType } from "./detection";
import { ProcessingError, ProcessingStatus, SamplingMethod } from "./observation";
import { ScoreBreakdown } from "./score";
import { WorkOrder } from "./work-order";

export const ISSUE_DETAIL_SCHEMA_VERSION = "issue-detail.v0" as const;
export const ISSUE_DETAIL_OBSERVATION_LIMIT = 50;

export const IssueStatus = z.enum(["OPEN", "RESOLVED"]);
export type IssueStatus = z.infer<typeof IssueStatus>;

/** Evidence access is either a short-lived authorized URL or an explicit reason it is unavailable. */
export const EvidenceAccess = z.discriminatedUnion("status", [
  z.strictObject({ status: z.literal("AVAILABLE"), url: z.url(), expiresAt: UtcInstant }),
  z.strictObject({ status: z.literal("UNAVAILABLE"), reason: z.enum(["SIGNER_NOT_CONFIGURED", "NOT_UPLOADED"]) }),
]);
export type EvidenceAccess = z.infer<typeof EvidenceAccess>;

export const Issue = z.strictObject({
  id: Uuid,
  issueType: IssueType,
  status: IssueStatus,
  location: Coordinates,
  locationUncertaintyM: NullableMetres,
  areaName: z.string().max(200).nullable(),
  roadName: z.string().max(200).nullable(),
  firstObservedAt: UtcInstant,
  lastObservedAt: UtcInstant,
  observationCount: z.int().min(0),
  isSynthetic: z.boolean(),
});
export type Issue = z.infer<typeof Issue>;

export const IssueObservation = z.strictObject({
  id: Uuid,
  sessionId: Uuid,
  capturedAt: UtcInstant,
  location: Coordinates,
  horizontalAccuracyM: NullableMetres,
  samplingMethod: SamplingMethod,
  processingStatus: ProcessingStatus,
  processingError: ProcessingError.nullable(),
  isSynthetic: z.boolean(),
  detection: Detection.nullable(),
  evidence: EvidenceAccess,
});
export type IssueObservation = z.infer<typeof IssueObservation>;

/** `GET /issues/{id}` response. */
export const IssueDetailResponse = z.strictObject({
  schemaVersion: z.literal(ISSUE_DETAIL_SCHEMA_VERSION),
  issue: Issue,
  /** Latest assessment, or null if the issue has not been scored yet. */
  riskAssessment: ScoreBreakdown.nullable(),
  /** Newest first, at most ISSUE_DETAIL_OBSERVATION_LIMIT. */
  observations: z.array(IssueObservation).max(ISSUE_DETAIL_OBSERVATION_LIMIT),
  observationsTruncated: z.boolean(),
  /** Newest first. */
  workOrders: z.array(WorkOrder),
});
export type IssueDetailResponse = z.infer<typeof IssueDetailResponse>;
