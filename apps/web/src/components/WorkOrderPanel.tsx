import { useRef, useState } from "react";
import { WorkOrderStatus as WorkOrderStatusEnum } from "@astig/contracts";
import { ApiError, type IssueStatus, type Role, type WorkOrder, type WorkOrderStatus } from "../api/types";
import { nextWorkOrderStatus } from "../domain/workOrder";
import { formatUtc, label } from "../domain/labels";
import { Icon } from "./Icon";
import styles from "./WorkOrderPanel.module.css";

export interface CreateInput {
  idempotencyKey: string;
  assignedTeam: string | undefined;
  notes: string | undefined;
}

interface Props {
  role: Role;
  issueStatus: IssueStatus;
  /** The assessment the officer is reviewing; null when the issue is not scored. */
  riskAssessmentId: string | null;
  /** Newest first (contract order). */
  workOrders: WorkOrder[];
  onCreate: (input: CreateInput) => Promise<void>;
  onAdvance: (workOrderId: string, status: WorkOrderStatus) => Promise<void>;
}

const newKey = () => crypto.randomUUID();
const STEPS = WorkOrderStatusEnum.options;

/** Display-only stepper for the current status. Every step has a text state, not just a colour. */
function Steps({ status }: { status: WorkOrderStatus }) {
  const at = STEPS.indexOf(status);
  return (
    <ol className={styles.steps} aria-label="Work order progress">
      {STEPS.map((s, i) => {
        const state = i < at || status === "RESOLVED" ? "done" : i === at ? "current" : "todo";
        return (
          <li key={s} className={styles.step} data-state={state} aria-current={i === at ? "step" : undefined}>
            <span>{label(s)}</span>
            <span className={styles.stepState}>{state === "done" ? "Done" : state === "current" ? "Current" : "Not started"}</span>
          </li>
        );
      })}
    </ol>
  );
}

export function WorkOrderPanel({ role, issueStatus, riskAssessmentId, workOrders, onCreate, onAdvance }: Props) {
  const [assignedTeam, setAssignedTeam] = useState("");
  const [notes, setNotes] = useState("");
  // One key per create attempt: a retry after a failure reuses it, so the server can
  // replay instead of creating a duplicate. A new key is issued after success.
  const [idempotencyKey, setIdempotencyKey] = useState(newKey);
  const [error, setError] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const [busy, setBusy] = useState(false);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const isOfficer = role === "OFFICER";
  // Editing the form makes it a different request, so it gets a new key.
  const edit = (set: (v: string) => void, v: string) => {
    set(v);
    setIdempotencyKey(newKey());
  };

  /**
   * Runs an action. While busy, buttons are aria-disabled rather than disabled so
   * keyboard focus is not dropped. `after` runs on success; `moveFocus` sends focus
   * to the section heading when the control the user pressed is about to disappear.
   */
  async function run(action: () => Promise<void>, after: { announce: string; moveFocus: boolean; onSuccess?: () => void }) {
    if (busy) return;
    setBusy(true);
    setError(null);
    setAnnouncement("");
    try {
      await action();
      after.onSuccess?.();
      setAnnouncement(after.announce);
      if (after.moveFocus) headingRef.current?.focus();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Something went wrong. Try again.");
    } finally {
      setBusy(false);
    }
  }

  const current = workOrders[0] ?? null;
  const active = current && current.status !== "RESOLVED" ? current : null;
  const next = active ? nextWorkOrderStatus(active.status) : null;
  const canCreate = issueStatus === "OPEN" && !active && riskAssessmentId !== null;
  const readOnly = !isOfficer;

  return (
    <section aria-labelledby="work-order-heading" className={styles.section}>
      <h3 id="work-order-heading" ref={headingRef} tabIndex={-1} className={styles.heading}>
        <Icon name="clipboard" className={styles.headingIcon} />
        Work order
      </h3>
      <p role="status" className="visually-hidden">
        {announcement}
      </p>
      {error && (
        <p role="alert" className={styles.error}>
          {error}
        </p>
      )}

      {current && (
        <>
          <p className={styles.statusRow}>
            Status:{" "}
            <span data-status={current.status} className={styles.status}>
              {label(current.status)}
            </span>
            {current.assignedTeam && ` · Assigned to ${current.assignedTeam}`}
          </p>
          <Steps status={current.status} />
          <p className={styles.muted}>
            Created {formatUtc(current.createdAt)} by {current.createdBySubject}
            {current.resolvedAt && ` · Resolved ${formatUtc(current.resolvedAt)}`}
          </p>
          {current.notes && <p className={styles.muted}>{current.notes}</p>}
          {active && next && (
            <button
              type="button"
              className={styles.primary}
              disabled={readOnly}
              aria-disabled={busy || undefined}
              onClick={() =>
                run(() => onAdvance(active.id, next), {
                  announce: `Work order status changed to ${label(next)}.`,
                  moveFocus: next === "RESOLVED",
                })
              }
            >
              Mark {label(next)}
            </button>
          )}
          {!active && <p className={styles.muted}>This work order is resolved.</p>}
        </>
      )}

      {canCreate && (
        <form
          className={styles.form}
          onSubmit={(e) => {
            e.preventDefault();
            void run(
              () => onCreate({ idempotencyKey, assignedTeam: assignedTeam.trim() || undefined, notes: notes.trim() || undefined }),
              { announce: "Work order created. Status: Open.", moveFocus: true, onSuccess: () => setIdempotencyKey(newKey()) },
            );
          }}
        >
          <p className={styles.muted}>
            {current ? "No active work order." : "No work order yet."} An officer reviews the evidence and score above before creating one.
          </p>
          <label className={styles.field}>
            <span>Assigned team (team or department, not a person)</span>
            <input
              className={styles.input}
              value={assignedTeam}
              maxLength={120}
              onChange={(e) => edit(setAssignedTeam, e.target.value)}
              disabled={readOnly}
            />
          </label>
          <label className={styles.field}>
            <span>Notes</span>
            <textarea className={styles.textarea} value={notes} maxLength={2000} onChange={(e) => edit(setNotes, e.target.value)} disabled={readOnly} />
          </label>
          <button type="submit" className={styles.primary} disabled={readOnly} aria-disabled={busy || undefined}>
            Create work order
          </button>
        </form>
      )}

      {!current && !canCreate && (
        <p className={styles.muted}>
          {riskAssessmentId === null ? "A work order needs a risk assessment to review; this issue is not scored yet." : "This issue is not open."}
        </p>
      )}

      {readOnly && <p className={styles.muted}>Only an authorized officer can create or update work orders.</p>}
    </section>
  );
}
