import { useEffect, useRef, useState, type FormEvent } from "react";
import { checkResolutionFile } from "../domain/resolution";
import styles from "./FieldReportDialog.module.css";

export type FieldReportKind = "START" | "RESOLVE";

export interface FieldReport {
  /** Team on site (START only). */
  team?: string;
  /** Inspection findings (START) or work done (RESOLVE). */
  text: string;
  /** JPEG photos to attach as work-order evidence. */
  files: File[];
}

interface Props {
  kind: FieldReportKind;
  defaultTeam: string;
  /** How many more photos this work order can take. */
  photoSlots: number;
  busy: boolean;
  error: string | null;
  onCancel: () => void;
  onSubmit: (report: FieldReport) => void;
}

const COPY = {
  START: {
    title: "Start repair work: field inspection",
    intro: "Record what the crew found on site before work starts. This is saved on the work order.",
    textLabel: "Inspection findings",
    confirm: "The crew inspected the site in person",
    photos: "Site photos (optional, JPEG)",
    submit: "Confirm and start work",
  },
  RESOLVE: {
    title: "Complete repair: close-out report",
    intro: "Describe the work done and attach after photos. The issue is marked resolved.",
    textLabel: "Work done",
    confirm: "The repair was verified on site",
    photos: "After photos (optional, JPEG)",
    submit: "Confirm repair complete",
  },
} as const;

/** Modal field report shown when a crew starts or completes work. Escape cancels. */
export function FieldReportDialog({ kind, defaultTeam, photoSlots, busy, error, onCancel, onSubmit }: Props) {
  const c = COPY[kind];
  const [team, setTeam] = useState(defaultTeam);
  const [text, setText] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [fileProblem, setFileProblem] = useState<string | null>(null);
  const firstField = useRef<HTMLInputElement & HTMLTextAreaElement>(null);

  useEffect(() => {
    firstField.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) onCancel();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [busy, onCancel]);

  function choose(list: FileList | null) {
    const picked = list ? [...list] : [];
    if (picked.length > photoSlots) {
      setFiles([]);
      setFileProblem(`At most ${photoSlots} more photo${photoSlots === 1 ? "" : "s"} can be attached to this work order.`);
      return;
    }
    const problem = picked.map((f) => checkResolutionFile(f)).find(Boolean) ?? null;
    setFileProblem(problem);
    setFiles(problem ? [] : picked);
  }

  const valid = text.trim().length >= 5 && confirmed && !fileProblem && (kind === "RESOLVE" || team.trim().length > 0);

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!valid || busy) return;
    onSubmit({ team: kind === "START" ? team.trim() : undefined, text: text.trim(), files });
  }

  return (
    <div className={styles.backdrop}>
      <div role="dialog" aria-modal="true" aria-labelledby="field-report-title" className={styles.dialog}>
        <form onSubmit={submit} className={styles.form}>
          <h2 id="field-report-title" className={styles.title}>
            {c.title}
          </h2>
          <p className={styles.intro}>{c.intro}</p>
          {kind === "START" && (
            <label className={styles.field}>
              <span>Crew / team on site</span>
              <input ref={firstField} value={team} maxLength={120} onChange={(e) => setTeam(e.target.value)} required />
            </label>
          )}
          <label className={styles.field}>
            <span>{c.textLabel}</span>
            <textarea
              ref={kind === "RESOLVE" ? firstField : undefined}
              value={text}
              maxLength={1200}
              rows={4}
              onChange={(e) => setText(e.target.value)}
              required
            />
          </label>
          <label className={styles.check}>
            <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} />
            <span>{c.confirm}</span>
          </label>
          {photoSlots > 0 ? (
            <label className={styles.field}>
              <span>
                {c.photos}, up to {photoSlots}
              </span>
              <input type="file" accept="image/jpeg,.jpg,.jpeg" multiple onChange={(e) => choose(e.target.files)} />
            </label>
          ) : (
            <p className={styles.intro}>This work order already has the maximum number of photos.</p>
          )}
          {fileProblem && (
            <p role="alert" className={styles.error}>
              {fileProblem}
            </p>
          )}
          {error && (
            <p role="alert" className={styles.error}>
              {error}
            </p>
          )}
          <p role="status" className={styles.intro}>
            {busy ? (files.length ? `Saving and uploading ${files.length} photo${files.length === 1 ? "" : "s"}…` : "Saving…") : ""}
          </p>
          <div className={styles.actions}>
            <button type="button" className={styles.cancel} onClick={onCancel} disabled={busy}>
              Cancel
            </button>
            <button type="submit" className={styles.submit} disabled={!valid} aria-disabled={busy || undefined}>
              {c.submit}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
