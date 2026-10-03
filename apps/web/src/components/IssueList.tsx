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

export function IssueList({ items, selectedId, onSelect }: Props) {
  return (
    <section className={styles.section} aria-labelledby="issue-list-title">
      <h2 id="issue-list-title" className={styles.heading}>
        Issues ({items.length})
      </h2>
      <ul className={styles.list} aria-label="Issues">
        {items.map(({ issue, severity, totalScore, workOrderStatus }) => (
          <li key={issue.id}>
            <button
              type="button"
              className={styles.item}
              aria-pressed={issue.id === selectedId}
              onClick={() => onSelect(issue.id)}
            >
              <span className={styles.score}>
                {totalScore === null ? "–" : fmt(totalScore)}
                <span className="visually-hidden">{totalScore === null ? "not scored" : "priority score"}</span>
              </span>
              <span className={styles.title}>{label(issue.issueType)}</span>
              <span className={styles.pills}>
                <span data-severity={severity ?? "UNKNOWN"} className={styles.sev}>
                  {severity ? label(severity) : "Severity unknown"}
                </span>
                <span data-status={issue.status} className={styles.status}>
                  Issue {label(issue.status)}
                </span>
                {issue.isSynthetic && <DemoBadge />}
              </span>
              <span className={styles.meta}>
                {issue.areaName ?? "Area unknown"}
                {issue.roadName && `, ${issue.roadName}`} ·{" "}
                {workOrderStatus ? `Work order ${label(workOrderStatus)}` : "No work order"}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
