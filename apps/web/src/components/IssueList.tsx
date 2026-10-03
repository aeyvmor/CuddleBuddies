import type { IssueListItem } from "../api/types";
import { label } from "../domain/labels";
import { DemoBadge } from "./DemoBadge";
import styles from "./IssueList.module.css";

interface Props {
  items: IssueListItem[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}

const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));

/** Display order only: highest priority score first, unscored issues last. */
function byPriority(a: IssueListItem, b: IssueListItem): number {
  return (b.totalScore ?? -1) - (a.totalScore ?? -1);
}

export function IssueList({ items, selectedId, onSelect }: Props) {
  const sorted = [...items].sort(byPriority);
  return (
    <section className={styles.section} aria-labelledby="issue-list-title">
      <div className={styles.head}>
        <h2 id="issue-list-title" className={styles.heading}>
          Issue queue
        </h2>
        <span className={styles.count}>{items.length} shown</span>
        <span className={styles.sort}>Sorted by priority score</span>
      </div>
      <div className={styles.columns} aria-hidden="true">
        <span>Priority</span>
        <span>Type and location</span>
        <span>Status</span>
      </div>
      {sorted.length === 0 && <p className={styles.empty}>No issues match the current filters.</p>}
      <ul className={styles.list} aria-label="Issues">
        {sorted.map(({ issue, severity, totalScore, workOrderStatus }) => (
          <li key={issue.id}>
            <button
              type="button"
              className={styles.item}
              aria-pressed={issue.id === selectedId}
              onClick={() => onSelect(issue.id)}
            >
              <span className={styles.score} data-severity={severity ?? "UNKNOWN"}>
                {totalScore === null ? "–" : fmt(totalScore)}
                <span className="visually-hidden">{totalScore === null ? "not scored" : "priority score"}</span>
              </span>
              <span className={styles.body}>
                <span className={styles.titleRow}>
                  <span className={styles.title}>{label(issue.issueType)}</span>
                  {issue.isSynthetic && <DemoBadge />}
                </span>
                <span className={styles.meta}>
                  {issue.areaName ?? "Area unknown"}
                  {issue.roadName && `, ${issue.roadName}`} ·{" "}
                  {workOrderStatus ? `Work order ${label(workOrderStatus)}` : "No work order"}
                </span>
              </span>
              <span className={styles.pills}>
                <span data-severity={severity ?? "UNKNOWN"} className={styles.sev}>
                  {severity ? label(severity) : "Severity unknown"}
                </span>
                <span data-status={issue.status} className={styles.status}>
                  Issue {label(issue.status)}
                </span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
