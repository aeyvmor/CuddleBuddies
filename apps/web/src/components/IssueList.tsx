import type { Issue } from "../api/types";
import { label } from "../domain/labels";
import { DemoBadge } from "./DemoBadge";
import styles from "./IssueList.module.css";

interface Props {
  issues: Issue[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}

export function IssueList({ issues, selectedId, onSelect }: Props) {
  return (
    <ul className={styles.list} aria-label="Issues">
      {issues.map((i) => (
        <li key={i.id}>
          <button
            type="button"
            className={styles.item}
            aria-pressed={i.id === selectedId}
            onClick={() => onSelect(i.id)}
          >
            <span className={styles.title}>
              {label(i.issue_type)} <span data-severity={i.severity} className={styles.sev}>{label(i.severity)}</span>
            </span>
            <span className={styles.meta}>
              {i.area_name ?? "Area unknown"} · Score {i.risk.total} · {i.work_order ? `Work order ${label(i.work_order.status)}` : "No work order"}
            </span>
            {i.is_synthetic && <DemoBadge />}
          </button>
        </li>
      ))}
    </ul>
  );
}
