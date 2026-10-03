import { ObservationCaptureRequest } from "@astig/contracts";
import { evidenceObjectKey } from "@astig/domain";
import { idempotencyFingerprint } from "./fingerprint";
import { DataError, type Queryable, toIso } from "./support";

export interface RegisteredObservation {
  id: string;
  sessionId: string;
  clientObservationId: string;
  imageObjectKey: string;
  processingStatus: string;
  isSynthetic: boolean;
  createdAt: string;
}

export interface RegisterObservationResult {
  created: boolean;
  observation: RegisteredObservation;
}

interface ObservationRow {
  id: string;
  session_id: string;
  client_observation_id: string;
  image_object_key: string;
  processing_status: string;
  is_synthetic: boolean;
  created_at: Date;
  idempotency_fingerprint: string;
  [key: string]: unknown;
}

const mapRow = (r: ObservationRow): RegisteredObservation => ({
  id: r.id,
  sessionId: r.session_id,
  clientObservationId: r.client_observation_id,
  imageObjectKey: r.image_object_key,
  processingStatus: r.processing_status,
  isSynthetic: r.is_synthetic,
  createdAt: toIso(r.created_at),
});

/**
 * Idempotently registers capture metadata for a session (backs `POST /sessions/{id}/observations`).
 *
 * - The capture is re-validated here (defence in depth); invalid coordinates are rejected.
 * - Only the session's operator may register observations; the S3 key is derived server-side.
 * - Captures after a session ended are rejected; queued captures taken *before* the end are accepted,
 *   so the offline upload queue can drain after the operator stops the session.
 * - A retry with the same (session, clientObservationId) and identical metadata returns the
 *   existing row with `created: false`; the same key with different metadata is IDEMPOTENCY_CONFLICT.
 */
export async function registerObservation(
  db: Queryable,
  params: { sessionId: string; actorSubject: string; capture: unknown },
): Promise<RegisterObservationResult> {
  const parsed = ObservationCaptureRequest.safeParse(params.capture);
  if (!parsed.success) throw new DataError("VALIDATION_FAILED", "Observation capture metadata is invalid.");
  const capture = parsed.data;

  const session = await db.query<{ operator_subject: string; status: string; ended_at: Date | null; is_synthetic: boolean }>(
    "SELECT operator_subject, status, ended_at, is_synthetic FROM inspection_sessions WHERE id = $1",
    [params.sessionId],
  );
  const s = session.rows[0];
  if (!s) throw new DataError("NOT_FOUND", "Inspection session not found.");
  if (s.operator_subject !== params.actorSubject) {
    throw new DataError("FORBIDDEN", "Only the session operator can register observations.");
  }
  if (s.ended_at !== null && new Date(capture.capturedAt) > s.ended_at) {
    throw new DataError("VALIDATION_FAILED", "capturedAt is after the session ended.");
  }

  const fingerprint = idempotencyFingerprint(capture);
  const key = evidenceObjectKey(params.sessionId, capture.clientObservationId);
  const inserted = await db.query<ObservationRow>(
    `INSERT INTO observations (
       session_id, client_observation_id, idempotency_fingerprint, schema_version, sequence_number,
       captured_at, latitude, longitude, horizontal_accuracy_m, sampling_method, distance_from_previous_m,
       image_object_key, is_synthetic)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
     -- Untargeted: concurrent duplicates can collide on either the client-id or the (derived)
     -- object-key unique index first; both mean "same observation" and fall through to the lookup.
     ON CONFLICT DO NOTHING
     RETURNING *`,
    [
      params.sessionId,
      capture.clientObservationId,
      fingerprint,
      capture.schemaVersion,
      capture.sequenceNumber,
      capture.capturedAt,
      capture.location.latitude,
      capture.location.longitude,
      capture.horizontalAccuracyM,
      capture.samplingMethod,
      capture.distanceFromPreviousM,
      key,
      s.is_synthetic,
    ],
  );
  if (inserted.rows[0]) return { created: true, observation: mapRow(inserted.rows[0]) };

  const existing = await db.query<ObservationRow>(
    "SELECT * FROM observations WHERE session_id = $1 AND client_observation_id = $2",
    [params.sessionId, capture.clientObservationId],
  );
  const row = existing.rows[0];
  if (!row) throw new Error("observation conflict reported but existing row not found");
  if (row.idempotency_fingerprint !== fingerprint) {
    throw new DataError("IDEMPOTENCY_CONFLICT", "clientObservationId was already used with different metadata.");
  }
  return { created: false, observation: mapRow(row) };
}
