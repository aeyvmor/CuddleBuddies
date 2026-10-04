import { useRef, useState } from "react";
import { WorkOrderStatus as WorkOrderStatusEnum } from "@astig/contracts";
import { newId } from "@astig/api-client";
import type { ResolutionPhotoInput } from "../api/client";
import { ApiError, errorText, type IssueStatus, type ResolutionEvidenceItem, type Role, type WorkOrder, type WorkOrderStatus } from "../api/types";
import { checkResolutionFile, RESOLUTION_MAX_PER_WORK_ORDER } from "../domain/resolution";
import { nextWorkOrderStatus } from "../domain/workOrder";
import { formatUtc, label } from "../domain/labels";
import { EvidenceImage, type ImageRetry } from "./EvidenceImage";
import { evidenceImageClasses } from "./EvidenceList";
import { Icon } from "./Icon";
import { FieldReportDialog, type FieldReport, type FieldReportKind } from "./FieldReportDialog";
import styles from "./WorkOrderPanel.module.css";

/** Notes are capped at 2000 characters: keep the newest entries when appending. */
export function appendNote(existing: string | null, entry: string): string {
  const combined = existing ? `${existing}\n\n${entry}` : entry;
  return combined.length <= 2000 ? combined : combined.slice(combined.length - 2000);
}

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
  /** "After" photos for this issue's work orders (optional in the contract). */
  resolutionEvidence: ResolutionEvidenceItem[];
  onCreate: (input: CreateInput) => Promise<void>;
  onAdvance: (workOrderId: string, status: WorkOrderStatus, details?: { notes?: string; assignedTeam?: string }) => Promise<void>;
  onAddPhoto: (workOrderId: string, input: ResolutionPhotoInput) => Promise<void>;
  retry: ImageRetry;
  onReload: () => void;
}

const STEPS = WorkOrderStatusEnum.options;

/** Shown error: the safe message and, when the API gave one, the requestId to quote in a report. */
interface ShownError {
  text: string;
  requestId: string | null;
}
const toShown = (e: unknown): ShownError => ({
  text: errorText(e, "Something went wrong. Try again."),
  requestId: e instanceof ApiError ? e.requestId : null,
});

function ErrorLine({ error, className }: { error: ShownError; className: string | undefined }) {
  return (
    <p role="alert" className={className}>
      {error.text}
      {error.requestId && <span className={styles.reference}> Reference: {error.requestId}</span>}
    </p>
  );
}

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

/** Optional "after" photo for an IN_PROGRESS or RESOLVED work order. JPEG only, at most 10 MB. */
function AfterPhoto(props: {
  workOrder: WorkOrder;
  photos: ResolutionEvidenceItem[];
  readOnly: boolean;
  onAdd: Props["onAddPhoto"];
  retry: ImageRetry;
  onReload: () => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [note, setNote] = useState("");
  const [problem, setProblem] = useState<string | null>(null);
  const [error, setError] = useState<ShownError | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState("");
  // One id per photo action: a retry after a failure reuses it, so the server returns the same record.
  const [evidenceId, setEvidenceId] = useState(newId);
  const inputRef = useRef<HTMLInputElement>(null);
  const full = props.photos.length >= RESOLUTION_MAX_PER_WORK_ORDER;

  function choose(f: File | null) {
    setFile(f);
    setError(null);
    setDone("");
    setEvidenceId(newId());
    setProblem(f ? checkResolutionFile(f) : null);
  }

  async function upload() {
    if (!file || problem || busy) return;
    setBusy(true);
    setError(null);
    try {
      await props.onAdd(props.workOrder.id, { clientEvidenceId: evidenceId, file, note: note.trim() || undefined });
      setDone("After photo uploaded.");
      setFile(null);
      setNote("");
      setEvidenceId(newId());
      if (inputRef.current) inputRef.current.value = "";
    } catch (e) {
      setError(toShown(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={styles.after}>
      <h4 className={styles.subheading}>After photo (optional)</h4>
      {props.photos.length > 0 ? (
        <ul className={styles.photos}>
          {props.photos.map((p) => (
            <li key={p.id} className={styles.photo}>
              <EvidenceImage evidence={p.evidence} alt={p.note ?? "After photo"} retry={props.retry} onReload={props.onReload} classes={evidenceImageClasses} />
              <span className={styles.muted}>
                Added {formatUtc(p.createdAt)}
                {p.note && ` · ${p.note}`}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className={styles.muted}>No after photo yet. A photo of the completed work is optional; no automatic before/after comparison is made.</p>
      )}
      {!props.readOnly && !full && (
        <div className={styles.form}>
          <label className={styles.field}>
            <span>Photo (JPEG, up to 10 MB)</span>
            <input
              ref={inputRef}
              type="file"
              accept="image/jpeg,.jpg,.jpeg"
              className={styles.input}
              onChange={(e) => choose(e.target.files?.[0] ?? null)}
              aria-describedby={problem ? "after-photo-problem" : undefined}
            />
          </label>
          {problem && (
            <p id="after-photo-problem" role="alert" className={styles.error}>
              {problem}
            </p>
          )}
          <label className={styles.field}>
            <span>Note (optional)</span>
            <input className={styles.input} value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} />
          </label>
          {error && <ErrorLine error={error} className={styles.error} />}
          <p role="status" className={styles.muted}>
            {busy ? "Uploading…" : done}
          </p>
          <button type="button" className={styles.secondary} disabled={!file || !!problem} aria-disabled={busy || undefined} onClick={() => void upload()}>
            Upload after photo
          </button>
        </div>
      )}
      {full && <p className={styles.muted}>This work order has the maximum of {RESOLUTION_MAX_PER_WORK_ORDER} after photos.</p>}
    </div>
  );
}

export function WorkOrderPanel(props: Props) {
  const { role, issueStatus, riskAssessmentId, workOrders, onCreate, onAdvance } = props;
  const [assignedTeam, setAssignedTeam] = useState("");
  const [notes, setNotes] = useState("");
  // One key per create action: a retry after a failure reuses it, so the server can
  // replay instead of creating a duplicate. A new key is issued after success.
  const [idempotencyKey, setIdempotencyKey] = useState(newId);
  const [error, setError] = useState<ShownError | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const [busy, setBusy] = useState(false);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const isOfficer = role === "OFFICER";
  // Editing the form makes it a different request, so it gets a new key.
  const edit = (set: (v: string) => void, v: string) => {
    set(v);
    setIdempotencyKey(newId());
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
      setError(toShown(e));
    } finally {
      setBusy(false);
    }
  }

  const current = workOrders[0] ?? null;
  const active = current && current.status !== "RESOLVED" ? current : null;
  const next = active ? nextWorkOrderStatus(active.status) : null;
  const canCreate = issueStatus === "OPEN" && !active && riskAssessmentId !== null;
  const readOnly = !isOfficer;
  const photos = current ? props.resolutionEvidence.filter((p) => p.workOrderId === current.id) : [];

  const [report, setReport] = useState<FieldReportKind | null>(null);
  const [reportBusy, setReportBusy] = useState(false);
  const [reportError, setReportError] = useState<string | null>(null);
  const advanceRef = useRef<HTMLButtonElement>(null);

  /**
   * Field report flow. START: save findings + crew, move to IN_PROGRESS, then attach site photos
   * (photos are accepted once IN_PROGRESS). RESOLVE: attach after photos first, then save the
   * close-out note and move to RESOLVED. Notes are appended with a UTC stamp, never overwritten.
   */
  async function submitReport(wo: WorkOrder, kind: FieldReportKind, r: FieldReport) {
    if (reportBusy) return;
    setReportBusy(true);
    setReportError(null);
    const stamp = new Date().toISOString().replace("T", " ").slice(0, 16) + " UTC";
    const entry = `[${kind === "START" ? "Field inspection" : "Repair completed"} ${stamp}] ${r.text}`;
    const notes = appendNote(wo.notes, entry);
    const upload = (photoNote: string) => async () => {
      for (const file of r.files) await props.onAddPhoto(wo.id, { clientEvidenceId: newId(), file, note: photoNote });
    };
    let statusSaved = false;
    try {
      if (kind === "START") {
        await onAdvance(wo.id, "IN_PROGRESS", { notes, ...(r.team && r.team !== wo.assignedTeam ? { assignedTeam: r.team } : {}) });
        statusSaved = true;
        await upload("Site inspection photo")();
      } else {
        await upload("After repair photo")();
        await onAdvance(wo.id, "RESOLVED", { notes });
        statusSaved = true;
      }
      setReport(null);
      setAnnouncement(`Work order status changed to ${label(kind === "START" ? "IN_PROGRESS" : "RESOLVED")}. Field report saved${r.files.length ? ` with ${r.files.length} photo${r.files.length === 1 ? "" : "s"}` : ""}.`);
      if (kind === "START") advanceRef.current?.focus();
      else headingRef.current?.focus();
    } catch (e) {
      if (statusSaved) {
        // Status and notes are saved; only a photo failed. Close and say so (photos can be re-added below).
        setReport(null);
        setError({ text: `Status saved, but a photo upload failed: ${errorText(e, "upload error")} Add it again under "After photo".`, requestId: e instanceof ApiError ? e.requestId : null });
        headingRef.current?.focus();
      } else {
        setReportError(errorText(e, "Could not save the field report. Try again."));
      }
    } finally {
      setReportBusy(false);
    }
  }

  return (
    <section aria-labelledby="work-order-heading" className={styles.section}>
      <h3 id="work-order-heading" ref={headingRef} tabIndex={-1} className={styles.heading}>
        <Icon name="clipboard" className={styles.headingIcon} />
        Work order
      </h3>
      <p role="status" className="visually-hidden">
        {announcement}
      </p>
      {error && <ErrorLine error={error} className={styles.error} />}

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
              ref={advanceRef}
              type="button"
              className={styles.primary}
              disabled={readOnly}
              aria-disabled={busy || undefined}
              onClick={() => {
                setReportError(null);
                setReport(next === "IN_PROGRESS" ? "START" : "RESOLVE");
              }}
            >
              Mark {label(next)}
            </button>
          )}
          {active && report && (
            <FieldReportDialog
              kind={report}
              defaultTeam={active.assignedTeam ?? ""}
              photoSlots={Math.max(0, RESOLUTION_MAX_PER_WORK_ORDER - photos.length)}
              busy={reportBusy}
              error={reportError}
              onCancel={() => {
                setReport(null);
                advanceRef.current?.focus();
              }}
              onSubmit={(r) => void submitReport(active, report, r)}
            />
          )}
          {!active && <p className={styles.muted}>This work order is resolved.</p>}
          {current.status !== "OPEN" && (
            <AfterPhoto
              workOrder={current}
              photos={photos}
              readOnly={readOnly}
              onAdd={props.onAddPhoto}
              retry={props.retry}
              onReload={props.onReload}
            />
          )}
        </>
      )}

      {canCreate && (
        <form
          className={styles.form}
          onSubmit={(e) => {
            e.preventDefault();
            void run(
              () => onCreate({ idempotencyKey, assignedTeam: assignedTeam.trim() || undefined, notes: notes.trim() || undefined }),
              { announce: "Work order created. Status: Open.", moveFocus: true, onSuccess: () => setIdempotencyKey(newId()) },
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
