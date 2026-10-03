import type { Queryable } from "./support";

/**
 * Aggregate-only analytics export for Amazon QuickSight. Reads the shared summary views and
 * writes one CSV + QuickSight manifest per dataset. Contains no image keys, free text, or user
 * identifiers. Files are overwritten on each run so QuickSight always reads the latest snapshot.
 */
export const ANALYTICS_PREFIX = "analytics";

export const ANALYTICS_DATASETS = {
  issues: {
    sql: `SELECT issue_id, issue_type, issue_status, area_name, road_name, latitude, longitude,
                 first_observed_at, last_observed_at, observation_count, max_severity, total_score,
                 known_cap_total, formula_version, work_order_status, work_order_created_at,
                 work_order_resolved_at, resolution_hours, is_synthetic
            FROM issue_summary ORDER BY issue_id`,
  },
  sessions: {
    sql: `SELECT session_id, session_status, started_at, ended_at, observations, captured_distance_m,
                 completed, failed, pending, is_synthetic
            FROM session_coverage ORDER BY session_id`,
  },
} as const;
export type AnalyticsDataset = keyof typeof ANALYTICS_DATASETS;

export interface ObjectWriter {
  put(key: string, body: string, contentType: string): Promise<void>;
}

/** RFC 4180 CSV value. Leading formula characters are neutralized (CSV injection). */
export function csvValue(v: unknown): string {
  if (v === null || v === undefined) return "";
  let s = v instanceof Date ? v.toISOString() : String(v);
  if (/^[=+\-@\t\r]/.test(s) && !/^-?\d/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(columns: string[], rows: Record<string, unknown>[]): string {
  const lines = [columns.join(",")];
  for (const r of rows) lines.push(columns.map((c) => csvValue(r[c])).join(","));
  return lines.join("\r\n") + "\r\n";
}

export function quickSightManifest(bucket: string, key: string): string {
  return JSON.stringify(
    {
      fileLocations: [{ URIs: [`s3://${bucket}/${key}`] }],
      globalUploadSettings: { format: "CSV", delimiter: ",", textqualifier: '"', containsHeader: "true" },
    },
    null,
    2,
  );
}

export async function exportAnalytics(
  db: Queryable,
  bucket: string,
  writer: ObjectWriter,
  now = new Date(),
): Promise<{ dataset: AnalyticsDataset; rows: number; csvKey: string; manifestKey: string }[]> {
  const results = [];
  for (const [name, def] of Object.entries(ANALYTICS_DATASETS) as [AnalyticsDataset, (typeof ANALYTICS_DATASETS)[AnalyticsDataset]][]) {
    const res = await db.query(def.sql);
    const columns = [...res.fields.map((f) => f.name), "exported_at"];
    const rows = res.rows.map((r) => ({ ...r, exported_at: now }));
    const csvKey = `${ANALYTICS_PREFIX}/${name}/${name}.csv`;
    const manifestKey = `${ANALYTICS_PREFIX}/manifests/${name}.json`;
    await writer.put(csvKey, toCsv(columns, rows), "text/csv; charset=utf-8");
    await writer.put(manifestKey, quickSightManifest(bucket, csvKey), "application/json");
    results.push({ dataset: name, rows: rows.length, csvKey, manifestKey });
  }
  return results;
}
