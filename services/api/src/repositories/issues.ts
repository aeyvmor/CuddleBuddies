import {
  ISSUE_DETAIL_OBSERVATION_LIMIT,
  ISSUE_DETAIL_SCHEMA_VERSION,
  RiskFactor,
  type Detection,
  type IssueDetailResponse,
  type IssueObservation,
  type ScoreBreakdown,
  type ScoreComponent,
} from "@astig/contracts";
import { type Queryable, toIso, toNumber, toNumberOrNull } from "@astig/database";
import { ApiError } from "../errors";
import { evidenceAccess, type EvidenceUrlSigner } from "../evidence";
import { mapWorkOrderRow, type WorkOrderRow } from "./work-orders";

type Row = Record<string, any>;

function mapComponent(r: Row): ScoreComponent {
  const base = {
    factor: r.factor,
    weight: toNumber(r.weight),
    cap: toNumber(r.cap),
    source: r.source,
    rationale: r.rationale,
  };
  return r.input_status === "KNOWN"
    ? { ...base, inputStatus: "KNOWN", normalizedValue: toNumber(r.normalized_value), weightedPoints: toNumber(r.weighted_points) }
    : { ...base, inputStatus: "UNKNOWN", normalizedValue: null, weightedPoints: null };
}

function mapDetection(r: Row): Detection | null {
  if (r.detection_id === null) return null;
  return {
    schemaVersion: r.d_schema_version,
    infrastructureVisible: r.infrastructure_visible,
    issueType: r.d_issue_type,
    obstructionType: r.obstruction_type,
    blockagePercent: toNumberOrNull(r.blockage_percent),
    severityEstimate: r.severity_estimate,
    confidence: toNumber(r.confidence),
    evidenceDescription: r.evidence_description,
    requiresHumanReview: r.requires_human_review,
    modelVersion: r.model_version,
    ...(Array.isArray(r.regions) && r.regions.length ? { regions: r.regions } : {}),
  };
}

/**
 * Reads issue detail from one consistent snapshot. Must be called inside a
 * `REPEATABLE READ` transaction (see app.ts) so counts, score, and work orders agree.
 */
export async function getIssueDetail(
  db: Queryable,
  issueId: string,
  signer: EvidenceUrlSigner | null,
): Promise<IssueDetailResponse> {
  const issueRes = await db.query(
    `SELECT i.*, (SELECT count(*) FROM observations o WHERE o.issue_id = i.id)::int AS observation_count
       FROM issues i WHERE i.id = $1`,
    [issueId],
  );
  const i = issueRes.rows[0];
  if (!i) throw new ApiError("NOT_FOUND", "Issue not found.");

  const raRes = await db.query(
    "SELECT * FROM risk_assessments WHERE issue_id = $1 ORDER BY computed_at DESC, id DESC LIMIT 1",
    [issueId],
  );
  let riskAssessment: ScoreBreakdown | null = null;
  const ra = raRes.rows[0];
  if (ra) {
    const compRes = await db.query("SELECT * FROM risk_score_components WHERE risk_assessment_id = $1", [ra.id]);
    const order = RiskFactor.options;
    riskAssessment = {
      id: ra.id,
      issueId: ra.issue_id,
      formulaVersion: ra.formula_version,
      totalScore: toNumber(ra.total_score),
      knownCapTotal: toNumber(ra.known_cap_total),
      computedAt: toIso(ra.computed_at),
      components: compRes.rows.map(mapComponent).sort((a, b) => order.indexOf(a.factor) - order.indexOf(b.factor)),
    };
  }

  const obsRes = await db.query(
    `SELECT o.id, o.session_id, o.captured_at, o.latitude, o.longitude, o.horizontal_accuracy_m, o.sampling_method,
            o.processing_status, o.processing_error_code, o.processing_error_message, o.is_synthetic,
            o.image_object_key, o.image_uploaded_at,
            d.id AS detection_id, d.schema_version AS d_schema_version, d.infrastructure_visible,
            d.issue_type AS d_issue_type, d.obstruction_type, d.blockage_percent, d.severity_estimate,
            d.confidence, d.evidence_description, d.requires_human_review, d.model_version, d.regions
       FROM observations o
       LEFT JOIN detections d ON d.observation_id = o.id
      WHERE o.issue_id = $1
      ORDER BY o.captured_at DESC, o.id DESC
      LIMIT $2`,
    [issueId, ISSUE_DETAIL_OBSERVATION_LIMIT + 1],
  );
  const obsRows = obsRes.rows.slice(0, ISSUE_DETAIL_OBSERVATION_LIMIT);
  const observations: IssueObservation[] = [];
  for (const o of obsRows) {
    observations.push({
      id: o.id,
      sessionId: o.session_id,
      capturedAt: toIso(o.captured_at),
      location: { latitude: o.latitude, longitude: o.longitude },
      horizontalAccuracyM: o.horizontal_accuracy_m,
      samplingMethod: o.sampling_method,
      processingStatus: o.processing_status,
      processingError:
        o.processing_error_code === null ? null : { code: o.processing_error_code, message: o.processing_error_message },
      isSynthetic: o.is_synthetic,
      detection: mapDetection(o),
      evidence: await evidenceAccess(signer, o.image_object_key, o.image_uploaded_at),
    });
  }

  const woRes = await db.query<WorkOrderRow>(
    "SELECT * FROM work_orders WHERE issue_id = $1 ORDER BY created_at DESC, id DESC",
    [issueId],
  );

  const reRes = await db.query(
    `SELECT r.id, r.work_order_id, r.note, r.created_at, r.image_object_key, r.uploaded_at
       FROM resolution_evidence r JOIN work_orders w ON w.id = r.work_order_id
      WHERE w.issue_id = $1 ORDER BY r.created_at DESC, r.id DESC LIMIT 50`,
    [issueId],
  );
  const resolutionEvidence = [];
  for (const r of reRes.rows) {
    resolutionEvidence.push({
      id: r.id,
      workOrderId: r.work_order_id,
      note: r.note,
      createdAt: toIso(r.created_at),
      evidence: await evidenceAccess(signer, r.image_object_key, r.uploaded_at),
    });
  }

  return {
    schemaVersion: ISSUE_DETAIL_SCHEMA_VERSION,
    issue: {
      id: i.id,
      issueType: i.issue_type,
      status: i.status,
      location: { latitude: i.latitude, longitude: i.longitude },
      locationUncertaintyM: i.location_uncertainty_m,
      areaName: i.area_name,
      roadName: i.road_name,
      firstObservedAt: toIso(i.first_observed_at),
      lastObservedAt: toIso(i.last_observed_at),
      observationCount: i.observation_count,
      isSynthetic: i.is_synthetic,
    },
    riskAssessment,
    observations,
    observationsTruncated: obsRes.rows.length > ISSUE_DETAIL_OBSERVATION_LIMIT,
    workOrders: woRes.rows.map(mapWorkOrderRow),
    resolutionEvidence,
  };
}
