import type { RiskScoreResult } from "@astig/domain";
import type { Queryable } from "./support";

/**
 * Inserts a risk assessment and its components. Must run inside the caller's transaction:
 * a deferred constraint trigger verifies at COMMIT that components exist, caps sum to <= 100,
 * and the stored totals equal the component sums.
 */
export async function insertRiskAssessment(
  db: Queryable,
  params: { issueId: string; result: RiskScoreResult; computedAt?: string; id?: string },
): Promise<string> {
  const { issueId, result } = params;
  const { rows } = await db.query<{ id: string }>(
    `INSERT INTO risk_assessments (id, issue_id, formula_version, total_score, known_cap_total, computed_at)
     VALUES (coalesce($1::uuid, gen_random_uuid()), $2, $3, $4, $5, coalesce($6::timestamptz, now()))
     RETURNING id`,
    [params.id ?? null, issueId, result.formulaVersion, result.totalScore, result.knownCapTotal, params.computedAt ?? null],
  );
  const id = rows[0]!.id;
  for (const c of result.components) {
    await db.query(
      `INSERT INTO risk_score_components
         (risk_assessment_id, factor, weight, cap, input_status, normalized_value, weighted_points, source, rationale)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [id, c.factor, c.weight, c.cap, c.inputStatus, c.normalizedValue, c.weightedPoints, c.source, c.rationale],
    );
  }
  return id;
}
