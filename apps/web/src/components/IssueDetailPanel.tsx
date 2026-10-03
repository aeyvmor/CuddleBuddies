import type { ActorRole, IssueDetail, WorkOrderStatus } from "../api/types";
import { label } from "../domain/labels";
import { DemoBadge } from "./DemoBadge";
import { EvidenceList } from "./EvidenceList";
import { ScoreBreakdown } from "./ScoreBreakdown";
import { WorkOrderPanel } from "./WorkOrderPanel";
import styles from "./IssueDetailPanel.module.css";

interface Props {
  issue: IssueDetail;
  role: ActorRole;
  onCreateWorkOrder: (input: { assignee: string | null; notes: string | null }) => Promise<void>;
  onAdvanceWorkOrder: (workOrderId: string, status: WorkOrderStatus) => Promise<void>;
}

export function IssueDetailPanel({ issue, role, onCreateWorkOrder, onAdvanceWorkOrder }: Props) {
  return (
    <article className={styles.panel} aria-label={`Issue ${issue.id}`}>
      <header>
        <h2>{label(issue.issue_type)}</h2>
        {issue.is_synthetic && <DemoBadge />}
        <p className={styles.meta}>
          {issue.id} · {label(issue.severity)} severity · {issue.area_name ?? "Area unknown"}
        </p>
        <p className={styles.meta}>
          Approx. location {issue.latitude.toFixed(5)}, {issue.longitude.toFixed(5)}
          {issue.location_uncertainty_m !== null
            ? ` (uncertainty ±${issue.location_uncertainty_m} m, not an exact asset position)`
            : " (uncertainty unknown)"}
        </p>
      </header>
      <p>{issue.recommendation}</p>
      <ScoreBreakdown risk={issue.risk} />
      <EvidenceList observations={issue.observations} />
      <WorkOrderPanel
        role={role}
        workOrder={issue.work_order}
        onCreate={onCreateWorkOrder}
        onAdvance={onAdvanceWorkOrder}
      />
    </article>
  );
}
