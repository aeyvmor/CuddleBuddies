import { useState } from "react";
import { ApiError, type ActorRole, type WorkOrder, type WorkOrderStatus } from "../api/types";
import { nextWorkOrderStatus } from "../domain/workOrder";
import { label } from "../domain/labels";
import styles from "./WorkOrderPanel.module.css";

interface Props {
  role: ActorRole;
  workOrder: WorkOrder | null;
  onCreate: (input: { assignee: string | null; notes: string | null }) => Promise<void>;
  onAdvance: (workOrderId: string, status: WorkOrderStatus) => Promise<void>;
}

export function WorkOrderPanel({ role, workOrder, onCreate, onAdvance }: Props) {
  const [assignee, setAssignee] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const isOfficer = role === "OFFICER";

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Something went wrong. Try again.");
    } finally {
      setBusy(false);
    }
  }

  const next = workOrder ? nextWorkOrderStatus(workOrder.status) : null;

  return (
    <section aria-label="Work order" className={styles.section}>
      <h3>Work order</h3>
      {error && <p role="alert" className={styles.error}>{error}</p>}

      {workOrder ? (
        <>
          <p>
            Status: <strong>{label(workOrder.status)}</strong>
            {workOrder.assignee && ` · Assigned to ${workOrder.assignee}`}
          </p>
          {workOrder.notes && <p className={styles.muted}>{workOrder.notes}</p>}
          {next ? (
            <button
              type="button"
              disabled={!isOfficer || busy}
              onClick={() => run(() => onAdvance(workOrder.id, next))}
            >
              Mark {label(next)}
            </button>
          ) : (
            <p className={styles.muted}>This work order is resolved.</p>
          )}
        </>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void run(() => onCreate({ assignee: assignee.trim() || null, notes: notes.trim() || null }));
          }}
        >
          <p className={styles.muted}>No work order yet. An officer reviews the evidence above before creating one.</p>
          <label className={styles.field}>
            <span>Assignee</span>
            <input value={assignee} onChange={(e) => setAssignee(e.target.value)} disabled={!isOfficer || busy} />
          </label>
          <label className={styles.field}>
            <span>Notes</span>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} disabled={!isOfficer || busy} />
          </label>
          <button type="submit" disabled={!isOfficer || busy}>Create work order</button>
        </form>
      )}

      {!isOfficer && <p className={styles.muted}>Only an authorized officer can create or update work orders.</p>}
    </section>
  );
}
