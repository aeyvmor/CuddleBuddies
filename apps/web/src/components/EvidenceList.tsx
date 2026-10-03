import type { EvidenceAccess, IssueObservation } from "../api/types";
import { formatUtc, label, samplingLabel } from "../domain/labels";
import { DemoBadge } from "./DemoBadge";
import { EvidenceImage, type ImageRetry } from "./EvidenceImage";
import { Icon } from "./Icon";
import styles from "./EvidenceList.module.css";

export const evidenceImageClasses = {
  image: styles.image,
  placeholder: styles.placeholder,
  placeholderIcon: styles.placeholderIcon,
  retryButton: styles.retryButton,
};

function Frame(props: { evidence: EvidenceAccess; alt: string; retry: ImageRetry; onReload: () => void }) {
  return <EvidenceImage {...props} classes={evidenceImageClasses} />;
}

function ObservationCard({ o, retry, onReload }: { o: IssueObservation; retry: ImageRetry; onReload: () => void }) {
  const d = o.detection;
  return (
    <li className={styles.card}>
      <p className={styles.head}>
        <Icon name="camera" className={styles.headIcon} />
        Captured {formatUtc(o.capturedAt)}
        {o.isSynthetic && <DemoBadge compact />}
      </p>
      {/* Capture frame: the image when access is granted, otherwise an explicit reason. Never a stand-in photo. */}
      <div className={styles.frame}>
        <Frame evidence={o.evidence} alt={d?.evidenceDescription ?? "Captured evidence image"} retry={retry} onReload={onReload} />
        <p className={styles.meta}>
          <span className={styles.chip}>
            <span className={styles.coords}>
              {o.location.latitude.toFixed(5)}, {o.location.longitude.toFixed(5)}
            </span>
            {o.horizontalAccuracyM !== null ? ` (GPS accuracy ±${o.horizontalAccuracyM} m)` : " (GPS accuracy not reported)"}
          </span>
          <span className={styles.chip}>Sampling: {samplingLabel(o.samplingMethod)}</span>
        </p>
      </div>
      {o.processingStatus === "FAILED" && (
        <p className={styles.failed}>
          Processing failed ({o.processingError?.code ?? "unknown error"}). No detection was recorded for this capture.
        </p>
      )}
      {(o.processingStatus === "PENDING" || o.processingStatus === "PROCESSING") && (
        <p className={styles.pending}>Processing status: {label(o.processingStatus)}. No detection yet.</p>
      )}
      {d && (
        <div className={styles.assessment}>
          <p className={styles.assessmentTitle}>
            <Icon name="sparkle" className={styles.assessmentIcon} />
            AI evidence extraction
            <span className={styles.confidence}>Confidence {Math.round(d.confidence * 100)}%</span>
          </p>
          <dl className={styles.detection}>
            <div className={styles.wide}>
              <dt>Evidence description</dt>
              <dd className={styles.description}>{d.evidenceDescription}</dd>
            </div>
            <div>
              <dt>AI-suggested type</dt>
              <dd>
                {label(d.issueType)} ({label(d.severityEstimate)} severity estimate)
              </dd>
            </div>
            <div>
              <dt>Blockage</dt>
              <dd>{d.blockagePercent === null ? "Not applicable / not estimated" : `${d.blockagePercent}%`}</dd>
            </div>
            <div>
              <dt>Obstruction</dt>
              <dd>{label(d.obstructionType)}</dd>
            </div>
            <div>
              <dt>Human review</dt>
              <dd>{d.requiresHumanReview ? "Flagged for review" : "Not flagged"}</dd>
            </div>
            <div className={styles.wide}>
              <dt>Model / schema</dt>
              <dd className={styles.versions}>
                {d.modelVersion} / {d.schemaVersion}
              </dd>
            </div>
          </dl>
        </div>
      )}
    </li>
  );
}

export function EvidenceList(props: { observations: IssueObservation[]; truncated: boolean; retry: ImageRetry; onReload: () => void }) {
  const { observations, truncated } = props;
  return (
    <section aria-label="Evidence history" className={styles.section}>
      <h3 className={styles.heading}>
        Evidence history ({observations.length}
        {truncated ? ", newest shown" : ""})
      </h3>
      <p className={styles.note}>AI output is advisory and extracts visible evidence only.</p>
      <ul className={styles.list}>
        {observations.map((o) => (
          <ObservationCard key={o.id} o={o} retry={props.retry} onReload={props.onReload} />
        ))}
      </ul>
    </section>
  );
}
