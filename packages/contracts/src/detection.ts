import { z } from "zod";

export const DETECTION_SCHEMA_VERSION = "detection.v0" as const;

// Enum values are a proposal pending team confirmation (see docs/api/contract-v0-proposal.md).
export const IssueType = z.enum(["BLOCKED_DRAIN", "DAMAGED_DRAIN", "STANDING_WATER", "ROAD_DAMAGE", "OTHER", "NONE"]);
export type IssueType = z.infer<typeof IssueType>;

export const ObstructionType = z.enum(["GARBAGE", "SEDIMENT", "VEGETATION", "DEBRIS", "OTHER", "NONE"]);
export type ObstructionType = z.infer<typeof ObstructionType>;

export const SeverityEstimate = z.enum(["NONE", "LOW", "MODERATE", "HIGH", "CRITICAL"]);
export type SeverityEstimate = z.infer<typeof SeverityEstimate>;

/**
 * Validated, provider-neutral vision output. This is the trust boundary for model output:
 * unknown properties, out-of-range numbers, and inconsistent combinations are rejected, never coerced.
 */
export const Detection = z
  .strictObject({
    schemaVersion: z.literal(DETECTION_SCHEMA_VERSION),
    infrastructureVisible: z.boolean(),
    issueType: IssueType,
    obstructionType: ObstructionType,
    blockagePercent: z.number().min(0).max(100).nullable(),
    severityEstimate: SeverityEstimate,
    confidence: z.number().min(0).max(1),
    evidenceDescription: z.string().trim().min(1).max(500),
    requiresHumanReview: z.boolean(),
    modelVersion: z.string().trim().min(1).max(100),
  })
  .superRefine((d, ctx) => {
    if (!d.infrastructureVisible) {
      if (d.issueType !== "NONE") {
        ctx.addIssue({ code: "custom", path: ["issueType"], message: "issueType must be NONE when infrastructure is not visible" });
      }
      if (d.blockagePercent !== null) {
        ctx.addIssue({ code: "custom", path: ["blockagePercent"], message: "blockagePercent must be null when infrastructure is not visible" });
      }
    }
  });
export type Detection = z.infer<typeof Detection>;
