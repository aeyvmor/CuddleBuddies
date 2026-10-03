import type { Observation } from "../api/types";
import { formatUtc, label } from "../domain/labels";
import styles from "./EvidenceList.module.css";

function ObservationCard({ o }: { o: Observation }) {
  const d = o.detection;
  return (
    <li className={styles.card}>
      <div className={styles.head}>
        <strong>{o.id}</strong> · {formatUtc(o.captured_at)}
      </div>
      <div className={styles.meta}>
        {o.latitude.toFixed(5)}, {o.longitude.toFixed(5)}
        {o.horizontal_accuracy_m !== null ? ` (GPS accuracy ±${o.horizontal_accuracy_m} m)` : " (GPS accuracy not reported)"}
      </div>
      {o.image_url ? (
        <img className={styles.image} src={o.image_url} alt={d?.evidence_description ?? "Captured evidence image"} />
      ) : (
        <div className={styles.placeholder} role="img" aria-label="No image available for this record">
          No image available
        </div>
      )}
      {o.processing_status === "FAILED" && (
        <p role="alert" className={styles.failed}>
          Processing failed ({o.error_code ?? "unknown error"}). No detection was recorded for this capture.
        </p>
      )}
      {(o.processing_status === "PENDING" || o.processing_status === "PROCESSING") && (
        <p className={styles.meta}>Processing status: {label(o.processing_status)}. No detection yet.</p>
      )}
      {d && (
        <dl className={styles.detection}>
          <dt>AI-suggested type</dt>
          <dd>{label(d.issue_type)} ({label(d.severity_estimate)} severity estimate)</dd>
          <dt>Confidence</dt>
          <dd>{Math.round(d.confidence * 100)}%</dd>
          <dt>Blockage</dt>
          <dd>{d.blockage_percent === null ? "Not applicable / not estimated" : `${d.blockage_percent}%`}</dd>
          <dt>Evidence description</dt>
          <dd>{d.evidence_description}</dd>
          <dt>Human review</dt>
          <dd>{d.requires_human_review ? "Flagged for review" : "Not flagged"}</dd>
          <dt>Model / schema</dt>
          <dd>{d.model_version} / {d.schema_version}</dd>
        </dl>
      )}
    </li>
  );
}

export function EvidenceList({ observations }: { observations: Observation[] }) {
  return (
    <section aria-label="Evidence history">
      <h3>Evidence history ({observations.length})</h3>
      <p className={styles.meta}>AI output is advisory and extracts visible evidence only.</p>
      <ul className={styles.list}>
        {observations.map((o) => (
          <ObservationCard key={o.id} o={o} />
        ))}
      </ul>
    </section>
  );
}
