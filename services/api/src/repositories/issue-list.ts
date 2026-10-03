import {
  ISSUE_LIST_MAX_LIMIT,
  type AnalyticsSummaryResponse,
  type IssueListItem,
  type IssueListQuery,
  type IssueListResponse,
} from "@astig/contracts";
import { type Queryable, toIso, toNumber, toNumberOrNull } from "@astig/database";
import { ApiError } from "../errors";

const encodeCursor = (offset: number) => Buffer.from(String(offset)).toString("base64url");
function decodeCursor(cursor: string | undefined): number {
  if (!cursor) return 0;
  const n = Number(Buffer.from(cursor, "base64url").toString("utf8"));
  if (!Number.isInteger(n) || n < 0 || n > 100_000) throw new ApiError("VALIDATION_FAILED", "cursor is invalid.");
  return n;
}

/**
 * Map/list query. Filters are parameterized; bbox uses the GiST index on issues.geom.
 * Offset cursor is adequate for the pilot's data size; switch to keyset if lists grow large.
 */
export async function listIssues(db: Queryable, q: IssueListQuery): Promise<IssueListResponse> {
  const where: string[] = [];
  const params: unknown[] = [];
  const add = (sql: string, value: unknown) => {
    params.push(value);
    where.push(sql.replace("?", `$${params.length}`));
  };
  if (q.issueType) add("s.issue_type = ?", q.issueType);
  if (q.severity) add("s.max_severity = ?", q.severity);
  if (q.areaName) add("s.area_name = ?", q.areaName);
  if (q.status) add("s.issue_status = ?", q.status);
  if (q.workOrderStatus === "NONE") where.push("s.work_order_status IS NULL");
  else if (q.workOrderStatus) add("s.work_order_status = ?", q.workOrderStatus);
  if (q.bbox) {
    params.push(q.bbox.minLon, q.bbox.minLat, q.bbox.maxLon, q.bbox.maxLat);
    const n = params.length;
    where.push(`i.geom && ST_MakeEnvelope($${n - 3}, $${n - 2}, $${n - 1}, $${n}, 4326)`);
  }

  const offset = decodeCursor(q.cursor);
  const limit = Math.min(q.limit, ISSUE_LIST_MAX_LIMIT);
  params.push(limit + 1, offset);
  const res = await db.query(
    `SELECT s.*, i.location_uncertainty_m
       FROM issue_summary s JOIN issues i ON i.id = s.issue_id
      ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
      ORDER BY s.total_score DESC NULLS LAST, s.last_observed_at DESC, s.issue_id
      LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params,
  );

  const items: IssueListItem[] = res.rows.slice(0, limit).map((r: any) => ({
    issue: {
      id: r.issue_id,
      issueType: r.issue_type,
      status: r.issue_status,
      location: { latitude: r.latitude, longitude: r.longitude },
      locationUncertaintyM: r.location_uncertainty_m,
      areaName: r.area_name,
      roadName: r.road_name,
      firstObservedAt: toIso(r.first_observed_at),
      lastObservedAt: toIso(r.last_observed_at),
      observationCount: r.observation_count,
      isSynthetic: r.is_synthetic,
    },
    severity: r.max_severity,
    totalScore: toNumberOrNull(r.total_score),
    workOrderStatus: r.work_order_status,
  }));

  const areas = await db.query<{ area_name: string }>(
    "SELECT DISTINCT area_name FROM issues WHERE area_name IS NOT NULL ORDER BY area_name LIMIT 200",
  );
  return {
    items,
    nextCursor: res.rows.length > limit ? encodeCursor(offset + limit) : null,
    areaNames: areas.rows.map((a) => a.area_name),
  };
}

/** Operational summary for the web dashboard; mirrors the QuickSight export. */
export async function analyticsSummary(db: Queryable, now = new Date()): Promise<AnalyticsSummaryResponse> {
  const issues = await db.query<any>(
    `SELECT count(*)::int AS total,
            count(*) FILTER (WHERE issue_status = 'OPEN')::int AS open,
            count(*) FILTER (WHERE issue_status = 'RESOLVED')::int AS resolved,
            count(*) FILTER (WHERE observation_count > 1)::int AS repeat_issues,
            avg(observation_count)::float AS mean_obs,
            bool_or(is_synthetic) AS any_synthetic
       FROM issue_summary`,
  );
  const woResolved = await db.query<any>(
    `SELECT count(*) FILTER (WHERE status = 'OPEN')::int AS open,
            count(*) FILTER (WHERE status = 'IN_PROGRESS')::int AS in_progress,
            count(*) FILTER (WHERE status = 'RESOLVED')::int AS n,
            (avg(extract(epoch FROM resolved_at - created_at) / 3600) FILTER (WHERE status = 'RESOLVED'))::float AS mean_hours
       FROM work_orders`,
  );
  const byType = await db.query<any>("SELECT issue_type, count(*)::int AS n FROM issue_summary GROUP BY 1 ORDER BY 1");
  const bySeverity = await db.query<any>(
    "SELECT max_severity, count(*)::int AS n FROM issue_summary GROUP BY 1 ORDER BY astig_severity_rank(max_severity) NULLS FIRST",
  );
  const byArea = await db.query<any>("SELECT area_name, count(*)::int AS n FROM issue_summary GROUP BY 1 ORDER BY 1 NULLS LAST");
  const coverage = await db.query<any>(
    `SELECT count(*)::int AS sessions, coalesce(sum(observations), 0)::int AS observations,
            coalesce(sum(captured_distance_m), 0)::float AS distance, bool_or(is_synthetic) AS any_synthetic
       FROM session_coverage`,
  );
  const processing = await db.query<any>(
    "SELECT processing_status, count(*)::int AS n FROM observations GROUP BY 1 ORDER BY 1",
  );

  const i = issues.rows[0];
  const c = coverage.rows[0];
  const round2 = (v: number | null) => (v === null ? null : Math.round(v * 100) / 100);
  return {
    generatedAt: now.toISOString(),
    includesSynthetic: Boolean(i.any_synthetic || c.any_synthetic),
    issues: {
      total: i.total,
      open: i.open,
      resolved: i.resolved,
      byType: byType.rows.map((r: any) => ({ issueType: r.issue_type, count: r.n })),
      bySeverity: bySeverity.rows.map((r: any) => ({ severity: r.max_severity, count: r.n })),
      byArea: byArea.rows.map((r: any) => ({ areaName: r.area_name, count: r.n })),
    },
    workOrders: {
      open: woResolved.rows[0].open,
      inProgress: woResolved.rows[0].in_progress,
      resolved: woResolved.rows[0].n,
      meanResolutionHours: round2(woResolved.rows[0].mean_hours),
    },
    recurrence: { repeatIssues: i.repeat_issues, meanObservationsPerIssue: round2(i.mean_obs) },
    coverage: { sessions: c.sessions, observations: c.observations, capturedDistanceM: toNumber(round2(c.distance) ?? 0) },
    processing: processing.rows.map((r: any) => ({ status: r.processing_status, count: r.n })),
  };
}
