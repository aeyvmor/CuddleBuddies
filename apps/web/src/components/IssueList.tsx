import { useEffect, useRef } from "react";
import type { IssueListItem } from "../api/types";
import { label } from "../domain/labels";
import { DemoBadge } from "./DemoBadge";
import styles from "./IssueList.module.css";

interface Props {
  /** Already in queue order (domain/filters.ts sortByPriority). Null while loading or after a failed load. */
  items: IssueListItem[] | null;
  selectedId: string | null;
  onSelect: (id: string) => void;
  /** Shown instead of the list when items is null. */
  unavailableText: string;
}

const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));

export function IssueList({ items, selectedId, onSelect, unavailableText }: Props) {
  // Keep the selected row visible inside the scrolling queue (e.g. after choosing a map marker or Next).
  const listRef = useRef<HTMLUListElement>(null);
  useEffect(() => {
    if (!selectedId) return;
    const row = listRef.current?.querySelector<HTMLElement>(`[data-issue-id="${selectedId}"]`);
    if (row && typeof row.scrollIntoView === "function") row.scrollIntoView({ block: "nearest" });
  }, [selectedId]);

  return (
    <section className={styles.section} aria-labelledby="issue-list-title">
      <div className={styles.head}>
        <h2 id="issue-list-title" className={styles.heading}>
          Issue queue
        </h2>
        {items && <span className={styles.count}>{items.length} shown</span>}
        <span className={styles.sort}>Highest priority first</span>
      </div>
      <div className={styles.columns} aria-hidden="true">
        <span>Priority</span>
        <span>Type and location</span>
        <span>Status</span>
      </div>
      {items === null && <p className={styles.empty}>{unavailableText}</p>}
      {items?.length === 0 && <p className={styles.empty}>No issues match the current filters.</p>}
      <ul ref={listRef} className={styles.list} aria-label="Issues">
        {(items ?? []).map(({ issue, severity, totalScore, workOrderStatus }) => {
          const place = `${issue.areaName ?? "Area unknown"}${issue.roadName ? `, ${issue.roadName}` : ""}`;
          return (
            <li key={issue.id} data-issue-id={issue.id}>
              <button type="button" className={styles.item} aria-pressed={issue.id === selectedId} onClick={() => onSelect(issue.id)}>
                <span className={styles.score} data-severity={severity ?? "UNKNOWN"}>
                  {totalScore === null ? "–" : fmt(totalScore)}
                  <span className="visually-hidden">{totalScore === null ? "not scored" : "priority score"}</span>
                </span>
                <span className={styles.body}>
                  <span className={styles.titleRow}>
                    <span className={styles.title}>{label(issue.issueType)}</span>
                    {issue.isSynthetic && <DemoBadge compact />}
                  </span>
                  <span className={styles.place} title={place}>
                    {place}
                  </span>
                  <span className={styles.meta}>{workOrderStatus ? `Work order ${label(workOrderStatus)}` : "No work order"}</span>
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
          );
        })}
      </ul>
    </section>
  );
}
