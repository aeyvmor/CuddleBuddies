import { Detection } from "@astig/contracts";
import { computeRiskScore, evidenceObjectKey, normalizeRecurrence, normalizeSeverity, type RiskInputs } from "@astig/domain";
import type { Client } from "pg";
import { idempotencyFingerprint } from "../src/fingerprint";
import { insertRiskAssessment } from "../src/risk-assessments";
import { SEED, SEED_ISSUES, SEED_OBSERVATIONS, SEED_SESSIONS, SEED_WORK_ORDERS } from "../seeds/synthetic-demo";

const unknown = (rationale: string) => ({ status: "UNKNOWN" as const, source: null, rationale });

/**
 * Inserts the deterministic synthetic demo dataset in one transaction. Refuses to run twice
 * (use `npm run db:reset` to return to the pristine seed state) rather than silently merging.
 */
export async function seed(client: Client, log: (msg: string) => void = console.log): Promise<boolean> {
  const exists = await client.query("SELECT 1 FROM devices WHERE id = $1", [SEED.deviceId]);
  if (exists.rowCount) {
    log("synthetic seed already present; run `npm run db:reset` for a clean seed state");
    return false;
  }

  await client.query("BEGIN");
  try {
    await client.query("INSERT INTO devices (id, label, is_synthetic) VALUES ($1, $2, true)", [SEED.deviceId, "SYNTHETIC demo phone 01"]);
    await client.query("INSERT INTO vehicles (id, label, is_synthetic) VALUES ($1, $2, true)", [SEED.vehicleId, "SYNTHETIC demo vehicle 01"]);

    for (const s of SEED_SESSIONS) {
      await client.query(
        `INSERT INTO inspection_sessions (id, device_id, vehicle_id, operator_subject, status, started_at, ended_at,
           start_latitude, start_longitude, is_synthetic)
         VALUES ($1, $2, $3, $4, 'ENDED', $5, $6, $7, $8, true)`,
        [s.id, SEED.deviceId, SEED.vehicleId, SEED.operatorSubject, s.startedAt, s.endedAt, s.start.latitude, s.start.longitude],
      );
    }

    for (const issue of SEED_ISSUES) {
      const obs = SEED_OBSERVATIONS.filter((o) => o.issueId === issue.id).sort((a, b) => a.capturedAt.localeCompare(b.capturedAt));
      if (obs.length === 0) throw new Error(`seed issue ${issue.id} has no observations`);
      await client.query(
        `INSERT INTO issues (id, issue_type, status, latitude, longitude, location_uncertainty_m, area_name, road_name,
           first_observed_at, last_observed_at, is_synthetic, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, true, $9, $10)`,
        [issue.id, issue.issueType, issue.status, issue.location.latitude, issue.location.longitude, issue.locationUncertaintyM,
          issue.areaName, issue.roadName, obs[0]!.capturedAt, obs.at(-1)!.capturedAt],
      );
    }

    for (const o of SEED_OBSERVATIONS) {
      const capture = {
        schemaVersion: "observation-capture.v0",
        clientObservationId: o.clientObservationId,
        sequenceNumber: o.sequenceNumber,
        capturedAt: o.capturedAt,
        location: o.location,
        horizontalAccuracyM: o.horizontalAccuracyM,
        samplingMethod: o.samplingMethod,
        distanceFromPreviousM: o.distanceFromPreviousM,
      };
      const p = o.processing;
      await client.query(
        `INSERT INTO observations (id, session_id, client_observation_id, idempotency_fingerprint, schema_version,
           sequence_number, captured_at, latitude, longitude, horizontal_accuracy_m, sampling_method,
           distance_from_previous_m, image_object_key, image_uploaded_at, processing_status, processing_attempts,
           processing_error_code, processing_error_message, issue_id, is_synthetic, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, true, $7, $7)`,
        [o.id, o.sessionId, o.clientObservationId, idempotencyFingerprint(capture), capture.schemaVersion, o.sequenceNumber,
          o.capturedAt, o.location.latitude, o.location.longitude, o.horizontalAccuracyM, o.samplingMethod,
          o.distanceFromPreviousM, evidenceObjectKey(o.sessionId, o.clientObservationId),
          p.status === "PENDING" ? null : o.capturedAt, p.status,
          p.status === "PENDING" ? 0 : p.status === "FAILED" ? p.attempts : 1,
          p.status === "FAILED" ? p.errorCode : null, p.status === "FAILED" ? p.errorMessage : null, o.issueId],
      );
      if (p.status === "COMPLETED") {
        const d = Detection.parse(p.detection); // seed data goes through the same trust boundary
        await client.query(
          `INSERT INTO detections (observation_id, schema_version, infrastructure_visible, issue_type, obstruction_type,
             blockage_percent, severity_estimate, confidence, evidence_description, requires_human_review, model_version, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
          [o.id, d.schemaVersion, d.infrastructureVisible, d.issueType, d.obstructionType, d.blockagePercent,
            d.severityEstimate, d.confidence, d.evidenceDescription, d.requiresHumanReview, d.modelVersion, o.capturedAt],
        );
      }
    }

    for (const issue of SEED_ISSUES) {
      const obs = SEED_OBSERVATIONS.filter((o) => o.issueId === issue.id).sort((a, b) => a.capturedAt.localeCompare(b.capturedAt));
      const latest = obs.at(-1)!;
      if (latest.processing.status !== "COMPLETED") throw new Error("latest seed observation must be COMPLETED");
      const severity = latest.processing.detection.severityEstimate;
      const inputs: RiskInputs = {
        SEVERITY: { status: "KNOWN", normalizedValue: normalizeSeverity(severity), source: "latest-detection", rationale: `Latest validated detection severity ${severity}.` },
        WEATHER: unknown("No weather feed configured for the demo."),
        RECURRENCE: { status: "KNOWN", normalizedValue: normalizeRecurrence(obs.length), source: "observation-history", rationale: `${obs.length} linked observation(s).` },
        HAZARD: unknown("No hazard dataset configured for the demo."),
        EXPOSURE:
          issue.syntheticExposure === null
            ? unknown("No road/population exposure dataset configured for the demo.")
            : { status: "KNOWN", normalizedValue: issue.syntheticExposure, source: "SYNTHETIC demo assumption", rationale: "SYNTHETIC: placeholder arterial-road exposure value for demonstration only." },
      };
      await insertRiskAssessment(client, {
        id: issue.riskAssessmentId,
        issueId: issue.id,
        result: computeRiskScore(inputs),
        computedAt: latest.capturedAt,
      });
    }

    for (const w of SEED_WORK_ORDERS) {
      const request = { riskAssessmentId: w.riskAssessmentId, assignedTeam: w.assignedTeam, notes: w.notes };
      const updatedAt = w.resolvedAt ?? w.startedAt ?? w.createdAt;
      await client.query(
        `INSERT INTO work_orders (id, issue_id, risk_assessment_id, idempotency_key, idempotency_fingerprint, status,
           assigned_team, notes, created_by_subject, created_at, updated_at, started_at, resolved_at, version)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
        [w.id, w.issueId, w.riskAssessmentId, w.idempotencyKey, idempotencyFingerprint(request), w.status, w.assignedTeam,
          w.notes, SEED.officerSubject, w.createdAt, updatedAt, w.startedAt, w.resolvedAt,
          1 + (w.startedAt ? 1 : 0) + (w.resolvedAt ? 1 : 0)],
      );
      const events: [string, string | null, string, string][] = [["CREATED", null, "OPEN", w.createdAt]];
      if (w.startedAt) events.push(["STATUS_CHANGED", "OPEN", "IN_PROGRESS", w.startedAt]);
      if (w.resolvedAt) events.push(["STATUS_CHANGED", "IN_PROGRESS", "RESOLVED", w.resolvedAt]);
      for (const [type, from, to, at] of events) {
        await client.query(
          `INSERT INTO work_order_events (work_order_id, event_type, from_status, to_status, actor_subject, changed_fields, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [w.id, type, from, to, SEED.officerSubject, type === "CREATED" ? [] : ["status"], at],
        );
      }
    }

    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  }
  log(`seeded synthetic demo data: ${SEED_ISSUES.length} issues, ${SEED_OBSERVATIONS.length} observations, ${SEED_WORK_ORDERS.length} work orders`);
  return true;
}
