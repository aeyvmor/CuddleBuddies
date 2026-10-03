import styles from "./DemoBadge.module.css";

export function DemoBadge({ label = "SYNTHETIC DEMO DATA" }: { label?: string }) {
  return <span className={styles.badge}>{label}</span>;
}
