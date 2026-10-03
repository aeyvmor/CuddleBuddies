import type { IssueDetailResponse, Role, WorkOrderStatus } from "../api/types";
import { highestSeverity } from "../domain/filters";
import { formatUtc, label } from "../domain/labels";
import { DemoBadge } from "./DemoBadge";
import { EvidenceList } from "./EvidenceList";
import { Icon } from "./Icon";
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
        <p className={styles.crumbs}>
          <a className={styles.back} href="#issue-queue">
            <Icon name="arrowUp" /> Issue queue
          </a>
          <span aria-hidden="true">/</span>
          <span>
            {issue.areaName ?? "Area unknown"}
            {issue.roadName && `, ${issue.roadName}`}
          </span>
        </p>
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
          <span className={styles.advisory}>AI output is advisory; an officer decides.</span>
        </p>
      </header>
      <div className={styles.grid}>
        <div className={styles.column}>
          <EvidenceList observations={observations} truncated={detail.observationsTruncated} />
        </div>
        <div className={styles.column}>
          <ScoreBreakdown risk={riskAssessment} />
          <section aria-label="Location and history" className={styles.location}>
            <h3 className={styles.sectionTitle}>
              <Icon name="pin" className={styles.sectionIcon} />
              Location and history
            </h3>
            <dl className={styles.facts}>
              <div className={styles.fact}>
                <dt>Area</dt>
                <dd>
                  {issue.areaName ?? "Area unknown"}
                  {issue.roadName && `, ${issue.roadName}`}
                </dd>
              </div>
              <div className={styles.fact}>
                <dt>Approx. location</dt>
                <dd>
                  <span className={styles.coords}>
                    {issue.location.latitude.toFixed(5)}, {issue.location.longitude.toFixed(5)}
                  </span>
                  {issue.locationUncertaintyM !== null
                    ? ` (uncertainty ±${issue.locationUncertaintyM} m, not an exact asset position)`
                    : " (uncertainty unknown)"}
                </dd>
              </div>
              <div className={styles.fact}>
                <dt>Observed</dt>
                <dd>
                  {formatUtc(issue.firstObservedAt)} to {formatUtc(issue.lastObservedAt)}
                </dd>
              </div>
              <div className={styles.fact}>
                <dt>Observations</dt>
                <dd className={styles.factStrong}>{issue.observationCount} observation(s)</dd>
              </div>
            </dl>
          </section>
          <WorkOrderPanel
            role={role}
            issueStatus={issue.status}
            riskAssessmentId={riskAssessment?.id ?? null}
            workOrders={detail.workOrders}
            onCreate={onCreateWorkOrder}
            onAdvance={onAdvanceWorkOrder}
          />
        </div>
      </div>
    </article>
  );
}
