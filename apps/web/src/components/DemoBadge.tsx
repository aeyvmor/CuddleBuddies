import styles from "./DemoBadge.module.css";

/**
 * Synthetic-data label. `compact` is for repeated rows (queue, evidence cards) where the
 * page header already carries the full badge: shorter, but still words, never colour alone.
 */
export function DemoBadge({ label, compact = false }: { label?: string; compact?: boolean }) {
  return (
    <span className={compact ? styles.compact : styles.badge} title={compact ? "Synthetic demo data" : undefined}>
      {label ?? (compact ? "Synthetic" : "SYNTHETIC DEMO DATA")}
    </span>
  );
}
