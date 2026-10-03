import type { IssueDetailResponse, Role, WorkOrderStatus } from "../api/types";
import { highestSeverity } from "../domain/filters";
import { formatUtc, label } from "../domain/labels";
import { DemoBadge } from "./DemoBadge";
import { EvidenceList } from "./EvidenceList";
import { ScoreBreakdown } from "./ScoreBreakdown";
import { WorkOrderPanel, type CreateInput } from "./WorkOrderPanel";
import styles from "./IssueDetailPanel.module.css";

interface Props {
  detail: IssueDetailResponse;
  role: Role;
  onCreateWorkOrder: (input: CreateInput) => Promise<void>;
  onAdvanceWorkOrder: (workOrderId: string, status: WorkOrderStatus) => Promise<void>;
}

export function IssueDetailPanel({ detail, role, onCreateWorkOrder, onAdvanceWorkOrder }: Props) {
  const { issue, riskAssessment, observations } = detail;
  const severity = highestSeverity(observations);
  return (
    <article id="issue-detail" tabIndex={-1} className={styles.panel} aria-label={`Issue detail: ${label(issue.issueType)}`}>
      <header className={styles.header}>
        <div className={styles.titleRow}>
          <h2 className={styles.title}>{label(issue.issueType)}</h2>
          {issue.isSynthetic && <DemoBadge />}
        </div>
        <p className={styles.pills}>
          <span data-status={issue.status} className={styles.status}>
            Issue {label(issue.status)}
          </span>
          <span data-severity={severity ?? "UNKNOWN"} className={styles.sev}>
            {severity ? `Highest AI severity estimate: ${label(severity)}` : "No severity estimate"}
          </span>
        </p>
        <dl className={styles.facts}>
          <dt>Area</dt>
          <dd>
            {issue.areaName ?? "Area unknown"}
            {issue.roadName && `, ${issue.roadName}`}
          </dd>
          <dt>Approx. location</dt>
          <dd>
            {issue.location.latitude.toFixed(5)}, {issue.location.longitude.toFixed(5)}
            {issue.locationUncertaintyM !== null
              ? ` (uncertainty ±${issue.locationUncertaintyM} m, not an exact asset position)`
              : " (uncertainty unknown)"}
          </dd>
          <dt>Observed</dt>
          <dd>
            {formatUtc(issue.firstObservedAt)} to {formatUtc(issue.lastObservedAt)} · {issue.observationCount} observation(s)
          </dd>
        </dl>
      </header>
      <ScoreBreakdown risk={riskAssessment} />
      <EvidenceList observations={observations} truncated={detail.observationsTruncated} />
      <WorkOrderPanel
        role={role}
        issueStatus={issue.status}
        riskAssessmentId={riskAssessment?.id ?? null}
        workOrders={detail.workOrders}
        onCreate={onCreateWorkOrder}
        onAdvance={onAdvanceWorkOrder}
      />
    </article>
  );
}
