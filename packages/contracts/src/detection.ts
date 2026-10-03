import { z } from "zod";

export const DETECTION_SCHEMA_VERSION = "detection.v0" as const;

// Enum values are a proposal pending team confirmation (see docs/api/contract-v0-proposal.md).
export const IssueType = z.enum(["BLOCKED_DRAIN", "DAMAGED_DRAIN", "STANDING_WATER", "ROAD_DAMAGE", "OTHER", "NONE"]);
export type IssueType = z.infer<typeof IssueType>;

export const ObstructionType = z.enum(["GARBAGE", "SEDIMENT", "VEGETATION", "DEBRIS", "OTHER", "NONE"]);
export type ObstructionType = z.infer<typeof ObstructionType>;

export const SeverityEstimate = z.enum(["NONE", "LOW", "MODERATE", "HIGH", "CRITICAL"]);
export type SeverityEstimate = z.infer<typeof SeverityEstimate>;

const Coord = z.int().min(0).max(1000);
export const MAX_DETECTION_REGIONS = 5;

/**
 * AI-estimated image region of a visible problem: [ymin, xmin, ymax, xmax], each 0-1000 relative
 * to image height/width (Gemini's box_2d convention). Approximate and advisory, not a trained
 * object detector's output.
 */
export const DetectionRegion = z
  .strictObject({
    label: z.enum(["BLOCKED_DRAIN", "DAMAGED_DRAIN", "STANDING_WATER", "ROAD_DAMAGE", "OTHER"]),
    box: z.tuple([Coord, Coord, Coord, Coord]),
  })
  .refine((r) => r.box[0] < r.box[2] && r.box[1] < r.box[3], { message: "box must be [ymin, xmin, ymax, xmax] with min < max", path: ["box"] });
export type DetectionRegion = z.infer<typeof DetectionRegion>;

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
    /** Optional: older detections and providers without localisation omit it. */
    regions: z.array(DetectionRegion).max(MAX_DETECTION_REGIONS).optional(),
  })
  .superRefine((d, ctx) => {
    if (d.issueType === "NONE" && d.regions?.length) {
      ctx.addIssue({ code: "custom", path: ["regions"], message: "no regions when no issue is reported" });
    }
    if (!d.infrastructureVisible) {
      if (d.issueType !== "NONE") {
        ctx.addIssue({ code: "custom", path: ["issueType"], message: "issueType must be NONE when infrastructure is not visible" });
      }
      if (d.regions?.length) {
        ctx.addIssue({ code: "custom", path: ["regions"], message: "no regions when infrastructure is not visible" });
      }
      if (d.blockagePercent !== null) {
        ctx.addIssue({ code: "custom", path: ["blockagePercent"], message: "blockagePercent must be null when infrastructure is not visible" });
      }
    }
  });
export type Detection = z.infer<typeof Detection>;
