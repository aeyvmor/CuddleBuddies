-- 0002_summary_views.sql
-- Read-only summary views shared by GET /issues, GET /analytics/summary, and the
-- S3/QuickSight export, so every surface reports the same numbers. Views contain no image
-- keys, no free text, and no user identifiers.

CREATE FUNCTION astig_severity_rank(severity text) RETURNS int
LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
  SELECT CASE severity WHEN 'NONE' THEN 0 WHEN 'LOW' THEN 1 WHEN 'MODERATE' THEN 2
                       WHEN 'HIGH' THEN 3 WHEN 'CRITICAL' THEN 4 END
$$;

-- One row per issue.
CREATE VIEW issue_summary AS
SELECT
  i.id                    AS issue_id,
  i.issue_type,
  i.status                AS issue_status,
  i.area_name,
  i.road_name,
  i.latitude,
  i.longitude,
  i.first_observed_at,
  i.last_observed_at,
  i.is_synthetic,
  coalesce(obs.observation_count, 0)::int AS observation_count,
  sev.max_severity,
  ra.total_score,
  ra.known_cap_total,
  ra.formula_version,
  wo.status               AS work_order_status,
  wo.created_at           AS work_order_created_at,
  wo.resolved_at          AS work_order_resolved_at,
  CASE WHEN wo.resolved_at IS NOT NULL
       THEN round((extract(epoch FROM wo.resolved_at - wo.created_at) / 3600)::numeric, 2) END AS resolution_hours
FROM issues i
LEFT JOIN LATERAL (
  SELECT count(*) AS observation_count FROM observations o WHERE o.issue_id = i.id
) obs ON true
LEFT JOIN LATERAL (
  SELECT d.severity_estimate AS max_severity
    FROM observations o JOIN detections d ON d.observation_id = o.id
   WHERE o.issue_id = i.id AND o.processing_status = 'COMPLETED'
   ORDER BY astig_severity_rank(d.severity_estimate) DESC
   LIMIT 1
) sev ON true
LEFT JOIN LATERAL (
  SELECT r.total_score, r.known_cap_total, r.formula_version
    FROM risk_assessments r WHERE r.issue_id = i.id
   ORDER BY r.computed_at DESC, r.id DESC LIMIT 1
) ra ON true
LEFT JOIN LATERAL (
  SELECT w.status, w.created_at, w.resolved_at
    FROM work_orders w WHERE w.issue_id = i.id
   ORDER BY w.created_at DESC, w.id DESC LIMIT 1
) wo ON true;

-- One row per inspection session (route coverage).
CREATE VIEW session_coverage AS
SELECT
  s.id            AS session_id,
  s.status        AS session_status,
  s.started_at,
  s.ended_at,
  s.is_synthetic,
  count(o.id)::int                                           AS observations,
  coalesce(sum(o.distance_from_previous_m), 0)::double precision AS captured_distance_m,
  count(o.id) FILTER (WHERE o.processing_status = 'COMPLETED')::int AS completed,
  count(o.id) FILTER (WHERE o.processing_status = 'FAILED')::int    AS failed,
  count(o.id) FILTER (WHERE o.processing_status IN ('PENDING', 'PROCESSING'))::int AS pending
FROM inspection_sessions s
LEFT JOIN observations o ON o.session_id = s.id
GROUP BY s.id;

CREATE INDEX work_orders_issue_created_idx ON work_orders (issue_id, created_at DESC);
