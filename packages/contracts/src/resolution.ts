import { z } from "zod";
import { MAX_UPLOAD_BYTES } from "./session";
import { Uuid, UtcInstant } from "./common";

/**
 * Resolution evidence (requirement 12): an "after" image attached to a work order that is
 * IN_PROGRESS or RESOLVED. Image bytes go straight to S3 via the returned presigned PUT.
 * No automated before/after analysis.
 */
export const CreateResolutionEvidenceRequest = z.strictObject({
  /** Client-generated; retrying with the same id returns the same record. */
  clientEvidenceId: Uuid,
  contentType: z.literal("image/jpeg"),
  contentLengthBytes: z.int().min(1).max(MAX_UPLOAD_BYTES),
  note: z.string().trim().min(1).max(500).optional(),
});
export type CreateResolutionEvidenceRequest = z.infer<typeof CreateResolutionEvidenceRequest>;

export const ResolutionEvidenceStatus = z.enum(["PENDING_UPLOAD", "UPLOADED"]);

export const ResolutionEvidence = z.strictObject({
  id: Uuid,
  workOrderId: Uuid,
  status: ResolutionEvidenceStatus,
  note: z.string().nullable(),
  createdBySubject: z.string().min(1).max(200),
  createdAt: UtcInstant,
  uploadedAt: UtcInstant.nullable(),
});
export type ResolutionEvidence = z.infer<typeof ResolutionEvidence>;

export const ResolutionEvidenceResponse = z.strictObject({
  created: z.boolean(),
  evidence: ResolutionEvidence,
  /** Null when the image was already uploaded. */
  upload: z
    .strictObject({
      method: z.literal("PUT"),
      url: z.url(),
      headers: z.strictObject({ "content-type": z.literal("image/jpeg"), "content-length": z.string() }),
      expiresAt: UtcInstant,
    })
    .nullable(),
});
export type ResolutionEvidenceResponse = z.infer<typeof ResolutionEvidenceResponse>;
