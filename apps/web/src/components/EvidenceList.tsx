import type { IssueObservation } from "../api/types";
import { formatUtc, label, samplingLabel } from "../domain/labels";
import { DemoBadge } from "./DemoBadge";
import styles from "./EvidenceList.module.css";

const EVIDENCE_REASON: Record<string, string> = {
  NOT_UPLOADED: "Image not uploaded",
  SIGNER_NOT_CONFIGURED: "Image access is not configured",
};

function ObservationCard({ o }: { o: IssueObservation }) {
  const d = o.detection;
  return (
    <li className={styles.card}>
      <p className={styles.head}>
        Captured {formatUtc(o.capturedAt)}
        {o.isSynthetic && <DemoBadge />}
      </p>
      <p className={styles.meta}>
        <span className={styles.coords}>
          {o.location.latitude.toFixed(5)}, {o.location.longitude.toFixed(5)}
        </span>
        {o.horizontalAccuracyM !== null ? ` (GPS accuracy ±${o.horizontalAccuracyM} m)` : " (GPS accuracy not reported)"} · Sampling: {samplingLabel(o.samplingMethod)}
      </p>
      {o.evidence.status === "AVAILABLE" ? (
        <img className={styles.image} src={o.evidence.url} alt={d?.evidenceDescription ?? "Captured evidence image"} />
      ) : (
        <div className={styles.placeholder} role="img" aria-label={`No image: ${EVIDENCE_REASON[o.evidence.reason] ?? o.evidence.reason}`}>
          {EVIDENCE_REASON[o.evidence.reason] ?? o.evidence.reason}
        </div>
      )}
      {o.processingStatus === "FAILED" && (
        <p className={styles.failed}>
          Processing failed ({o.processingError?.code ?? "unknown error"}). No detection was recorded for this capture.
        </p>
      )}
      {(o.processingStatus === "PENDING" || o.processingStatus === "PROCESSING") && (
        <p className={styles.meta}>Processing status: {label(o.processingStatus)}. No detection yet.</p>
      )}
      {d && (
        <dl className={styles.detection}>
          <dt>AI-suggested type</dt>
          <dd>
            {label(d.issueType)} ({label(d.severityEstimate)} severity estimate)
          </dd>
          <dt>Confidence</dt>
          <dd>{Math.round(d.confidence * 100)}%</dd>
          <dt>Obstruction</dt>
          <dd>{label(d.obstructionType)}</dd>
          <dt>Blockage</dt>
          <dd>{d.blockagePercent === null ? "Not applicable / not estimated" : `${d.blockagePercent}%`}</dd>
          <dt>Evidence description</dt>
          <dd>{d.evidenceDescription}</dd>
          <dt>Human review</dt>
          <dd>{d.requiresHumanReview ? "Flagged for review" : "Not flagged"}</dd>
          <dt>Model / schema</dt>
          <dd>
            {d.modelVersion} / {d.schemaVersion}
          </dd>
        </dl>
      )}
    </li>
  );
}

export function EvidenceList({ observations, truncated }: { observations: IssueObservation[]; truncated: boolean }) {
  return (
    <section aria-label="Evidence history" className={styles.section}>
      <h3 className={styles.heading}>
        Evidence history ({observations.length}
        {truncated ? ", newest shown" : ""})
      </h3>
      <p className={styles.meta}>AI output is advisory and extracts visible evidence only.</p>
      <ul className={styles.list}>
        {observations.map((o) => (
          <ObservationCard key={o.id} o={o} />
        ))}
      </ul>
    </section>
  );
}
