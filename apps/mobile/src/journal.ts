/**
 * Append-only capture journal: one JSON capture record per line. Pure, tested without
 * a device; the file append itself is in src/storage.ts.
 *
 * Why: with the queue inside the state file, every capture rewrote every earlier record.
 * At vehicle speed and a 7 m interval that is a capture roughly every second, and a
 * one-hour route holds thousands of records. Appending one line costs the same at
 * record 1 and record 5,000.
 *
 * A crash can tear the last line. A torn line is counted and reported, never guessed at,
 * and the file is repaired with a newline so the next record starts on a fresh line.
 * When an uploader exists, upload progress can be appended as further line kinds.
 */
import { checkEntry } from "./persist.ts";
import { markUploaded, type QueueEntry } from "./queue.ts";
import type { SessionState } from "./session.ts";

/** A finished upload, appended after the capture's own line (the capture line is never rewritten). */
export interface UploadedMark {
  kind: "UPLOADED";
  clientObservationId: string;
  observationId: string;
  uploadedAt: string;
}

export function encodeEntry(entry: QueueEntry | UploadedMark): string {
  return `${JSON.stringify(entry)}\n`;
}

export function encodeEntries(entries: QueueEntry[]): string {
  return entries.map(encodeEntry).join("");
}

export interface JournalRead {
  entries: QueueEntry[];
  /** Lines that were not a valid capture record (for example a write torn by a crash). */
  unreadableLines: number;
  /** False when the file does not end with a newline: append one before the next record. */
  endsCleanly: boolean;
}

const isMark = (v: unknown): v is UploadedMark => {
  const m = v as Partial<UploadedMark> | null;
  return !!m && m.kind === "UPLOADED" && typeof m.clientObservationId === "string" && typeof m.observationId === "string" && typeof m.uploadedAt === "string";
};

export function parseJournal(text: string): JournalRead {
  let entries: QueueEntry[] = [];
  const marks: UploadedMark[] = [];
  let unreadableLines = 0;
  for (const line of text.split("\n")) {
    if (line.trim() === "") continue;
    try {
      const v: unknown = JSON.parse(line);
      if (checkEntry(v)) entries.push(v);
      else if (isMark(v)) marks.push(v);
      else unreadableLines += 1;
    } catch {
      unreadableLines += 1;
    }
  }
  for (const m of marks) entries = markUploaded(entries, m.clientObservationId, m.observationId, m.uploadedAt);
  return { entries, unreadableLines, endsCleanly: text === "" || text.endsWith("\n") };
}

/**
 * The state file and the journal are written separately, so after a crash the saved
 * nextSequence can lag the journal. Never reuse a sequence number that a record already has.
 */
export function reconcileSequence(state: SessionState, entries: QueueEntry[]): SessionState {
  if (state.phase === "IDLE") return state;
  const id = state.session.clientSessionId;
  let next = state.session.nextSequence;
  for (const e of entries) {
    if (e.kind === "CAPTURED" && e.clientSessionId === id) next = Math.max(next, e.request.sequenceNumber + 1);
  }
  return next === state.session.nextSequence ? state : { ...state, session: { ...state.session, nextSequence: next } };
}
