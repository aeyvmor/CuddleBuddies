import type { Issue } from "../api/types";
import { projectPoints } from "../domain/projection";
import { label } from "../domain/labels";
import styles from "./IssueMap.module.css";

interface Props {
  issues: Issue[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}

/**
 * Schematic map. The real map provider is undecided; keep this component's props
 * as the seam so a provider-backed map can replace it without touching callers.
 */
export function IssueMap({ issues, selectedId, onSelect }: Props) {
  const pts = projectPoints(issues);
  return (
    <section className={styles.map} aria-label="Issue map (schematic)">
      <p className={styles.note}>Schematic positions only. Not a basemap. Marker position is approximate.</p>
      {issues.length === 0 && <p className={styles.empty}>No issues match the current filters.</p>}
      {issues.map((issue, idx) => {
        const p = pts[idx]!;
        return (
          <button
            key={issue.id}
            type="button"
            className={styles.marker}
            data-severity={issue.severity}
            aria-pressed={issue.id === selectedId}
            aria-label={`Map marker: ${label(issue.issue_type)}, ${label(issue.severity)} severity, ${issue.id}`}
            style={{ left: `${p.x}%`, top: `${p.y}%` }}
            onClick={() => onSelect(issue.id)}
          />
        );
      })}
    </section>
  );
}
