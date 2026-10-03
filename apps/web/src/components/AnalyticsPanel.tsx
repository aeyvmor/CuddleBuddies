import type { AnalyticsSummaryResponse } from "../api/types";
import { formatUtc, label } from "../domain/labels";
import { DemoBadge } from "./DemoBadge";
import { Icon } from "./Icon";
import styles from "./AnalyticsPanel.module.css";

const fmt1 = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));

function Breakdown({ title, rows }: { title: string; rows: { key: string; name: string; count: number }[] }) {
  const max = Math.max(1, ...rows.map((r) => r.count));
  return (
    <div className={styles.block}>
      <h4 className={styles.blockTitle}>{title}</h4>
      {rows.length === 0 ? (
        <p className={styles.muted}>None yet.</p>
      ) : (
        <ul className={styles.rows}>
          {[...rows]
            .sort((a, b) => b.count - a.count)
            .map((r) => (
              <li key={r.key} className={styles.row}>
                <span className={styles.rowName}>{r.name}</span>
                <span className={styles.rowCount}>{r.count}</span>
                {/* Decorative bar; the number is the value. */}
                <span className={styles.bar} aria-hidden="true">
                  <span className={styles.barFill} style={{ width: `${(r.count / max) * 100}%` }} />
                </span>
              </li>
            ))}
        </ul>
      )}
    </div>
  );
}

function Figure({ name, value, note }: { name: string; value: string; note?: string }) {
  return (
    <div className={styles.figure}>
      <dt className={styles.figureName}>{name}</dt>
      <dd className={styles.figureValue}>
        {value}
        {note && <span className={styles.figureNote}>{note}</span>}
      </dd>
    </div>
  );
}

/**
 * GET /analytics/summary. The same SQL views feed the QuickSight export, so the numbers match.
 * This is reporting, not the operational queue.
 */
export function AnalyticsPanel(props: { summary: AnalyticsSummaryResponse | null; error: string | null; onRetry: () => void }) {
  const s = props.summary;
  return (
    <section id="analytics" aria-labelledby="analytics-title" className={styles.section}>
      <div className={styles.head}>
        <h2 id="analytics-title" className={styles.title}>
          <Icon name="gauge" className={styles.titleIcon} />
          Analytics summary
        </h2>
        {s?.includesSynthetic && <DemoBadge label="INCLUDES SYNTHETIC DEMO DATA" />}
        {s && <span className={styles.generated}>Generated {formatUtc(s.generatedAt)}</span>}
      </div>
      <p className={styles.muted}>Same figures as the QuickSight export. Severity is the highest AI estimate per issue, which is advisory.</p>

      {props.error && (
        <div role="alert" className={styles.error}>
          <span>{props.error}</span>
          <button type="button" className={styles.retry} onClick={props.onRetry}>
            <Icon name="refresh" /> Try again
          </button>
        </div>
      )}
      {!s && !props.error && <p className={styles.muted}>Loading analytics…</p>}

      {s && (
        <>
          <dl className={styles.figures}>
            <Figure name="Issues" value={String(s.issues.total)} note={`${s.issues.open} open · ${s.issues.resolved} resolved`} />
            <Figure
              name="Work orders"
              value={String(s.workOrders.open + s.workOrders.inProgress + s.workOrders.resolved)}
              note={`${s.workOrders.open} open · ${s.workOrders.inProgress} in progress · ${s.workOrders.resolved} resolved`}
            />
            <Figure
              name="Mean time to resolve"
              value={s.workOrders.meanResolutionHours === null ? "–" : `${fmt1(s.workOrders.meanResolutionHours)} h`}
              note={s.workOrders.meanResolutionHours === null ? "No resolved work orders yet" : "From creation to resolution"}
            />
            <Figure
              name="Repeat issues"
              value={String(s.recurrence.repeatIssues)}
              note={s.recurrence.meanObservationsPerIssue === null ? "No issues yet" : `${fmt1(s.recurrence.meanObservationsPerIssue)} observations per issue on average`}
            />
            <Figure
              name="Coverage"
              value={`${s.coverage.observations} captures`}
              note={`${s.coverage.sessions} session(s) · ${(s.coverage.capturedDistanceM / 1000).toFixed(2)} km between captures (client-reported estimate)`}
            />
          </dl>
          <div className={styles.grid}>
            <Breakdown title="By type" rows={s.issues.byType.map((r) => ({ key: r.issueType, name: label(r.issueType), count: r.count }))} />
            <Breakdown
              title="By severity (AI estimate)"
              rows={s.issues.bySeverity.map((r) => ({ key: r.severity ?? "none", name: r.severity ? label(r.severity) : "No severity estimate", count: r.count }))}
            />
            <Breakdown title="By area" rows={s.issues.byArea.map((r) => ({ key: r.areaName ?? "none", name: r.areaName ?? "Area not matched", count: r.count }))} />
            <Breakdown title="Capture processing" rows={s.processing.map((r) => ({ key: r.status, name: label(r.status), count: r.count }))} />
          </div>
        </>
      )}
    </section>
  );
}
