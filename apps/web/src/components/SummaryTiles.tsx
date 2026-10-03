import type { IssueListItem } from "../api/types";
import { Icon, type IconName } from "./Icon";
import styles from "./SummaryTiles.module.css";

interface Tile {
  key: string;
  name: string;
  caption: string;
  icon: IconName;
  count: number;
}

/**
 * Counts taken from the issue list the page already holds; this is not the
 * analytics summary (GET /analytics/summary), which stays a separate surface.
 * Severity tiles count open issues by their highest AI severity estimate.
 */
export function SummaryTiles({ items }: { items: IssueListItem[] }) {
  const open = items.filter((i) => i.issue.status === "OPEN");
  const bySeverity = (s: string) => open.filter((i) => i.severity === s).length;
  const tiles: Tile[] = [
    { key: "CRITICAL", name: "Critical", caption: "Open · AI estimate", icon: "alert", count: bySeverity("CRITICAL") },
    { key: "HIGH", name: "High", caption: "Open · AI estimate", icon: "warning", count: bySeverity("HIGH") },
    { key: "MODERATE", name: "Moderate", caption: "Open · AI estimate", icon: "clock", count: bySeverity("MODERATE") },
    { key: "OPEN", name: "Open", caption: "Issues awaiting resolution", icon: "inbox", count: open.length },
    { key: "RESOLVED", name: "Resolved", caption: "Issues closed out", icon: "check", count: items.length - open.length },
  ];
  return (
    <section aria-label="Issue summary" className={styles.section}>
      <dl className={styles.tiles}>
        {tiles.map((t) => (
          <div key={t.key} className={styles.tile} data-kind={t.key}>
            <dt className={styles.name}>{t.name}</dt>
            <dd className={styles.value}>
              <span className={styles.count}>{t.count}</span>
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
