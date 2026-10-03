import type { IssueListItem, SeverityEstimate } from "../api/types";
import { projectPoints } from "../domain/projection";
import { label } from "../domain/labels";
import styles from "./IssueMap.module.css";

interface Props {
  items: IssueListItem[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}

/** Marker letter, so severity is never conveyed by colour alone. */
const LETTER: Record<SeverityEstimate | "UNKNOWN", string> = {
  CRITICAL: "C",
  HIGH: "H",
  MODERATE: "M",
  LOW: "L",
  NONE: "N",
  UNKNOWN: "?",
};
const LEGEND: (SeverityEstimate | "UNKNOWN")[] = ["CRITICAL", "HIGH", "MODERATE", "LOW", "UNKNOWN"];

/**
 * Schematic map. The real map provider is undecided; keep this component's props
 * as the seam so a provider-backed map can replace it without touching callers.
 */
export function IssueMap({ items, selectedId, onSelect }: Props) {
  const pts = projectPoints(items.map((i) => i.issue.location));
  return (
    <section className={styles.map} aria-labelledby="issue-map-title">
      <div className={styles.head}>
        <h2 id="issue-map-title" className={styles.title}>
          Issue map
        </h2>
        <span className={styles.tag}>Schematic · not a basemap</span>
        <p className={styles.note}>Marker positions are approximate.</p>
      </div>
      <div className={styles.stage}>
        <div className={styles.canvas}>
          {items.length === 0 && <p className={styles.empty}>No issues match the current filters.</p>}
          <div className={styles.plot}>
          {items.map((item, idx) => {
            const p = pts[idx]!;
            const sev = item.severity ?? "UNKNOWN";
            return (
              <button
                key={item.issue.id}
                type="button"
                className={styles.marker}
                data-severity={sev}
                aria-pressed={item.issue.id === selectedId}
                aria-label={`Map marker: ${label(item.issue.issueType)}, ${item.severity ? `${label(item.severity)} severity` : "severity unknown"}, ${item.issue.areaName ?? "area unknown"}`}
                style={{ left: `${p.x}%`, top: `${p.y}%` }}
                onClick={() => onSelect(item.issue.id)}
              >
                <span aria-hidden="true">{LETTER[sev]}</span>
              </button>
            );
          })}
          </div>
        </div>
        <ul className={styles.legend} aria-label="Map legend">
          {LEGEND.map((s) => (
            <li key={s}>
              <span className={styles.legendSwatch} data-severity={s} aria-hidden="true">
                {LETTER[s]}
              </span>
              {s === "UNKNOWN" ? "Severity unknown" : label(s)}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
