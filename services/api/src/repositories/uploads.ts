import { MAX_UPLOAD_BYTES, type CreateUploadUrlRequest, type UploadUrlResponse } from "@astig/contracts";
import type { Queryable } from "@astig/database";
import { ApiError } from "../errors";
import type { EvidenceUploadSigner } from "../evidence";

/**
 * Issues a presigned PUT for an observation's server-derived key. Only the session operator may
 * upload; once the worker has recorded the upload, further URLs are refused (ALREADY_UPLOADED),
 * which lets an offline client treat a lost response as success.
 */
export async function createUploadUrl(
  db: Queryable,
  params: { request: CreateUploadUrlRequest; operatorSubject: string; signer: EvidenceUploadSigner | null },
): Promise<UploadUrlResponse> {
  const { request, operatorSubject, signer } = params;
  if (signer === null) throw new ApiError("SERVICE_UNAVAILABLE", "Evidence uploads are not configured.");
  if (request.contentLengthBytes > MAX_UPLOAD_BYTES) throw new ApiError("VALIDATION_FAILED", "Image is too large.");

  const res = await db.query<{ image_object_key: string; image_uploaded_at: Date | null; operator_subject: string }>(
    `SELECT o.image_object_key, o.image_uploaded_at, s.operator_subject
       FROM observations o JOIN inspection_sessions s ON s.id = o.session_id
      WHERE o.id = $1`,
    [request.observationId],
  );
  const row = res.rows[0];
  if (!row) throw new ApiError("NOT_FOUND", "Observation not found.");
  if (row.operator_subject !== operatorSubject) throw new ApiError("FORBIDDEN", "Only the session operator can upload evidence.");
  if (row.image_uploaded_at !== null) throw new ApiError("ALREADY_UPLOADED", "Evidence for this observation was already uploaded.");

  const { url, expiresAt } = await signer.signUpload({
    objectKey: row.image_object_key,
    contentType: request.contentType,
    contentLengthBytes: request.contentLengthBytes,
  });
  return {
    method: "PUT",
    url,
    headers: { "content-type": request.contentType, "content-length": String(request.contentLengthBytes) },
    expiresAt,
  };
}
