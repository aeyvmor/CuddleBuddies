import type { CreateResolutionEvidenceRequest, ResolutionEvidenceResponse } from "@astig/contracts";
import { idempotencyFingerprint, type Queryable, toIso, toIsoOrNull } from "@astig/database";
import { resolutionObjectKey } from "@astig/domain";
import { ApiError } from "../errors";
import type { EvidenceUploadSigner } from "../evidence";

export const MAX_RESOLUTION_EVIDENCE_PER_WORK_ORDER = 5;

interface Row {
  id: string;
  work_order_id: string;
  idempotency_fingerprint: string;
  note: string | null;
  image_object_key: string;
  content_length_bytes: number;
  created_by_subject: string;
  created_at: Date;
  uploaded_at: Date | null;
  [key: string]: unknown;
}

/**
 * Registers an "after" image for a work order that is IN_PROGRESS or RESOLVED and returns a
 * presigned PUT. Idempotent per (workOrder, clientEvidenceId): a retry returns the same record
 * and a fresh URL until the upload lands; afterwards `upload` is null. Must run in a transaction.
 */
export async function createResolutionEvidence(
  db: Queryable,
  params: { workOrderId: string; request: CreateResolutionEvidenceRequest; actorSubject: string; signer: EvidenceUploadSigner | null },
): Promise<ResolutionEvidenceResponse> {
  const { workOrderId, request, actorSubject, signer } = params;
  if (signer === null) throw new ApiError("SERVICE_UNAVAILABLE", "Evidence uploads are not configured.");

  const wo = await db.query<{ status: string }>("SELECT status FROM work_orders WHERE id = $1 FOR UPDATE", [workOrderId]);
  if (!wo.rows[0]) throw new ApiError("NOT_FOUND", "Work order not found.");

  const fingerprint = idempotencyFingerprint({ contentType: request.contentType, contentLengthBytes: request.contentLengthBytes, note: request.note ?? null });
  const existing = await db.query<Row>(
    "SELECT * FROM resolution_evidence WHERE work_order_id = $1 AND client_evidence_id = $2",
    [workOrderId, request.clientEvidenceId],
  );
  let row = existing.rows[0];
  let created = false;
  if (row) {
    if (row.idempotency_fingerprint !== fingerprint) throw new ApiError("IDEMPOTENCY_CONFLICT", "clientEvidenceId was already used with a different request.");
  } else {
    if (wo.rows[0].status === "OPEN") {
      throw new ApiError("INVALID_TRANSITION", "Resolution evidence can be attached once the work order is IN_PROGRESS or RESOLVED.");
    }
    const count = await db.query<{ n: number }>("SELECT count(*)::int AS n FROM resolution_evidence WHERE work_order_id = $1", [workOrderId]);
    if (count.rows[0]!.n >= MAX_RESOLUTION_EVIDENCE_PER_WORK_ORDER) {
      throw new ApiError("VALIDATION_FAILED", `At most ${MAX_RESOLUTION_EVIDENCE_PER_WORK_ORDER} resolution images per work order.`);
    }
    const inserted = await db.query<Row>(
      `INSERT INTO resolution_evidence (work_order_id, client_evidence_id, idempotency_fingerprint, note, image_object_key,
         content_length_bytes, created_by_subject)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [workOrderId, request.clientEvidenceId, fingerprint, request.note ?? null, resolutionObjectKey(workOrderId, request.clientEvidenceId),
        request.contentLengthBytes, actorSubject],
    );
    row = inserted.rows[0]!;
    created = true;
  }

  let upload: ResolutionEvidenceResponse["upload"] = null;
  if (row.uploaded_at === null) {
    const signed = await signer.signUpload({ objectKey: row.image_object_key, contentType: "image/jpeg", contentLengthBytes: row.content_length_bytes });
    upload = { method: "PUT", url: signed.url, headers: { "content-type": "image/jpeg", "content-length": String(row.content_length_bytes) }, expiresAt: signed.expiresAt };
  }
  return {
    created,
    evidence: {
      id: row.id,
      workOrderId: row.work_order_id,
      status: row.uploaded_at ? "UPLOADED" : "PENDING_UPLOAD",
      note: row.note,
      createdBySubject: row.created_by_subject,
      createdAt: toIso(row.created_at),
      uploadedAt: toIsoOrNull(row.uploaded_at),
    },
    upload,
  };
}
