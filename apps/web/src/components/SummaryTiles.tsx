import type { IssueListItem } from "../api/types";
import { Icon, type IconName } from "./Icon";
import styles from "./SummaryTiles.module.css";

interface Tile {
  key: string;
  name: string;
  caption: string;
  icon: IconName;
  count: number | null;
}

/**
 * Counts taken from the issue list the page already holds; this is not the
 * analytics summary (GET /analytics/summary), which stays a separate surface.
 * Severity tiles count open issues by their highest AI severity estimate.
 */
/** items is null while loading or when the list could not be loaded: tiles then show a dash, never a zero. */
export function SummaryTiles({ items }: { items: IssueListItem[] | null }) {
  const open = items?.filter((i) => i.issue.status === "OPEN") ?? null;
  const bySeverity = (s: string) => (open ? open.filter((i) => i.severity === s).length : null);
  const tiles: Tile[] = [
    { key: "CRITICAL", name: "Critical", caption: "Open · AI estimate", icon: "alert", count: bySeverity("CRITICAL") },
    { key: "HIGH", name: "High", caption: "Open · AI estimate", icon: "warning", count: bySeverity("HIGH") },
    { key: "MODERATE", name: "Moderate", caption: "Open · AI estimate", icon: "clock", count: bySeverity("MODERATE") },
    { key: "OPEN", name: "Open", caption: "Issues awaiting resolution", icon: "inbox", count: open ? open.length : null },
    { key: "RESOLVED", name: "Resolved", caption: "Issues closed out", icon: "check", count: items && open ? items.length - open.length : null },
  ];
  return (
    <section aria-label="Issue summary" className={styles.section}>
      <dl className={styles.tiles}>
        {tiles.map((t) => (
          <div key={t.key} className={styles.tile} data-kind={t.key}>
            <dt className={styles.name}>{t.name}</dt>
            <dd className={styles.value}>
              <span className={styles.count}>{t.count === null ? "–" : t.count}</span>
              {t.count === null && <span className="visually-hidden">not available</span>}
              <span className={styles.caption}>{t.caption}</span>
              <span className={styles.icon}>
                <Icon name={t.icon} />
              </span>
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
