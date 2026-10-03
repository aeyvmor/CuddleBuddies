import { Detection, type BeginResult, type CompleteResult, type PersistRequest } from "@astig/contracts";
import { insertRiskAssessment, type Queryable } from "@astig/database";
import {
  ISSUE_MATCH_RADIUS_M,
  computeRiskScore,
  issueTypeForDetection,
  normalizeRecurrence,
  normalizeSeverity,
  type RiskInputs,
} from "@astig/domain";

/** A PROCESSING row older than this is treated as abandoned (crashed run) and may be retaken. */
export const STALE_PROCESSING_MS = 5 * 60 * 1000;

interface ObsRow {
  id: string;
  processing_status: "PENDING" | "PROCESSING" | "COMPLETED" | "FAILED";
  updated_at: Date;
  latitude: number;
  longitude: number;
  horizontal_accuracy_m: number | null;
  captured_at: Date;
  is_synthetic: boolean;
  [key: string]: unknown;
}

const lockObservation = async (db: Queryable, objectKey: string) =>
  (await db.query<ObsRow>("SELECT * FROM observations WHERE image_object_key = $1 FOR UPDATE", [objectKey])).rows[0];

/**
 * Called when an object lands in S3. Records the upload and claims the observation for
 * processing. Idempotent under duplicate S3 deliveries. Must run inside a transaction.
 */
export async function beginProcessing(db: Queryable, objectKey: string, now = new Date()): Promise<BeginResult> {
  const o = await lockObservation(db, objectKey);
  if (!o) return { proceed: false, reason: "UNKNOWN_OBJECT" };
  await db.query("UPDATE observations SET image_uploaded_at = coalesce(image_uploaded_at, $2) WHERE id = $1", [o.id, now]);
  if (o.processing_status === "COMPLETED") return { proceed: false, reason: "ALREADY_COMPLETED" };
  if (o.processing_status === "PROCESSING" && now.getTime() - o.updated_at.getTime() < STALE_PROCESSING_MS) {
    return { proceed: false, reason: "IN_PROGRESS" };
  }
  await db.query(
    `UPDATE observations
        SET processing_status = 'PROCESSING', processing_attempts = processing_attempts + 1,
            processing_error_code = NULL, processing_error_message = NULL, updated_at = $2
      WHERE id = $1`,
    [o.id, now],
  );
  return { proceed: true, observationId: o.id };
}

/** Links a validated detection's observation to the nearest matching OPEN issue, or creates one. */
async function associateIssue(db: Queryable, o: ObsRow, issueType: string): Promise<string> {
  // Serialize association per issue type so concurrent nearby detections cannot create duplicates.
  await db.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`astig-issue-association:${issueType}`]);
  const match = await db.query<{ id: string }>(
    `SELECT id FROM issues
      WHERE status = 'OPEN' AND issue_type = $1
        AND ST_DWithin(geom::geography, ST_SetSRID(ST_MakePoint($2, $3), 4326)::geography, $4)
      ORDER BY geom <-> ST_SetSRID(ST_MakePoint($2, $3), 4326)
      LIMIT 1`,
    [issueType, o.longitude, o.latitude, ISSUE_MATCH_RADIUS_M],
  );
  if (match.rows[0]) {
    await db.query(
      `UPDATE issues SET first_observed_at = least(first_observed_at, $2), last_observed_at = greatest(last_observed_at, $2),
              updated_at = now() WHERE id = $1`,
      [match.rows[0].id, o.captured_at],
    );
    return match.rows[0].id;
  }
  // New issue at the raw capture point; uncertainty is the device accuracy (unknown stays unknown).
  // Area name comes from loaded, attributed boundaries; NULL when no boundary contains the point.
  const created = await db.query<{ id: string }>(
    `INSERT INTO issues (id, issue_type, latitude, longitude, location_uncertainty_m, area_name, first_observed_at, last_observed_at, is_synthetic)
     VALUES (gen_random_uuid(), $1, $2, $3, $4, astig_area_name_for($2, $3), $5, $5, $6) RETURNING id`,
    [issueType, o.latitude, o.longitude, o.horizontal_accuracy_m, o.captured_at, o.is_synthetic],
  );
  return created.rows[0]!.id;
}

/** Recomputes and persists the risk.v0 score for an issue from its linked evidence. */
export async function rescoreIssue(db: Queryable, issueId: string): Promise<string> {
  const stats = await db.query<{ n: number; severity: Detection["severityEstimate"] }>(
    `SELECT (SELECT count(*) FROM observations WHERE issue_id = $1)::int AS n,
            (SELECT d.severity_estimate FROM observations o JOIN detections d ON d.observation_id = o.id
              WHERE o.issue_id = $1 ORDER BY o.captured_at DESC, o.id DESC LIMIT 1) AS severity`,
    [issueId],
  );
  const { n, severity } = stats.rows[0]!;
  const unknown = (rationale: string) => ({ status: "UNKNOWN" as const, source: null, rationale });
  const inputs: RiskInputs = {
    SEVERITY: { status: "KNOWN", normalizedValue: normalizeSeverity(severity), source: "latest-detection", rationale: `Latest validated detection severity ${severity}.` },
    WEATHER: unknown("No weather feed configured."),
    RECURRENCE: { status: "KNOWN", normalizedValue: normalizeRecurrence(n), source: "observation-history", rationale: `${n} linked observation(s).` },
    HAZARD: unknown("No hazard dataset configured."),
    EXPOSURE: unknown("No road/population exposure dataset configured."),
  };
  return insertRiskAssessment(db, { issueId, result: computeRiskScore(inputs) });
}

/**
 * Records the processing outcome. A detection is re-validated against the shared schema before
 * persistence; COMPLETED is only written together with the detection (DB-enforced). Failures are
 * stored explicitly and never turned into detections. Must run inside a transaction.
 */
export async function completeProcessing(
  db: Queryable,
  objectKey: string,
  outcome: Extract<PersistRequest, { action: "COMPLETE" }>["outcome"],
): Promise<CompleteResult> {
  const o = await lockObservation(db, objectKey);
  if (!o) return { applied: false, reason: "UNKNOWN_OBJECT" };
  if (o.processing_status !== "PROCESSING") return { applied: false, reason: "NOT_PROCESSING" };

  if (outcome.kind === "FAILURE") {
    await db.query(
      `UPDATE observations SET processing_status = 'FAILED', processing_error_code = $2, processing_error_message = $3,
              updated_at = now() WHERE id = $1`,
      [o.id, outcome.code, outcome.message.slice(0, 500)],
    );
    return { applied: true, observationId: o.id, status: "FAILED", issueId: null };
  }

  const parsed = Detection.safeParse(outcome.detection);
  if (!parsed.success) {
    await db.query(
      `UPDATE observations SET processing_status = 'FAILED', processing_error_code = 'INVALID_MODEL_OUTPUT',
              processing_error_message = 'Detection failed schema validation at persistence.', updated_at = now() WHERE id = $1`,
      [o.id],
    );
    return { applied: true, observationId: o.id, status: "FAILED", issueId: null };
  }
  const d = parsed.data;
  await db.query(
    `INSERT INTO detections (observation_id, schema_version, infrastructure_visible, issue_type, obstruction_type,
       blockage_percent, severity_estimate, confidence, evidence_description, requires_human_review, model_version)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
     ON CONFLICT (observation_id) DO NOTHING`,
    [o.id, d.schemaVersion, d.infrastructureVisible, d.issueType, d.obstructionType, d.blockagePercent,
      d.severityEstimate, d.confidence, d.evidenceDescription, d.requiresHumanReview, d.modelVersion],
  );

  let issueId: string | null = null;
  const issueType = issueTypeForDetection(d);
  if (issueType) {
    issueId = await associateIssue(db, o, issueType);
    await db.query("UPDATE observations SET issue_id = $2 WHERE id = $1", [o.id, issueId]);
  }
  await db.query("UPDATE observations SET processing_status = 'COMPLETED', updated_at = now() WHERE id = $1", [o.id]);
  if (issueId) await rescoreIssue(db, issueId);
  return { applied: true, observationId: o.id, status: "COMPLETED", issueId };
}
