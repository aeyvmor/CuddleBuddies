/**
 * Device storage for the session and capture records (expo-file-system). Everything stays
 * in the app's private document directory: never the gallery, never uploaded.
 *
 * - astig-state.json: session and settings (small; rewritten on change, write-then-replace).
 * - astig-queue.jsonl: capture records, one per line, append-only (src/journal.ts).
 * - captures/<clientObservationId>.jpg: the images.
 * Format and validation live in src/persist.ts and src/journal.ts.
 */
import { Directory, File, Paths } from "expo-file-system";
import { encodeEntries, encodeEntry, parseJournal, reconcileSequence } from "./journal";
import { parse, serialize, type AppData, type PersistedState } from "./persist";
import type { QueueEntry } from "./queue";

const STATE_FILE = "astig-state.json";
const STATE_TMP = "astig-state.json.tmp";
const JOURNAL_FILE = "astig-queue.jsonl";
const CAPTURE_DIR = "captures";

export type LoadResult =
  | { status: "NONE"; queue: QueueEntry[]; warnings: string[] }
  | { status: "OK"; data: AppData; warnings: string[] }
  | { status: "UNREADABLE"; error: string; savedAside: string | null; queue: QueueEntry[]; warnings: string[] };

const journalFile = () => new File(Paths.document, JOURNAL_FILE);

function readJournal(warnings: string[]): QueueEntry[] {
  const f = journalFile();
  if (!f.exists) return [];
  const read = parseJournal(f.textSync());
  if (read.unreadableLines > 0) {
    warnings.push(`${read.unreadableLines} saved capture record(s) could not be read and are not counted. The file is kept unchanged for the team.`);
  }
  // A torn last line: start the next record on a fresh line.
  if (!read.endsCleanly) f.write("\n", { append: true });
  return read.entries;
}

/** Read the saved state and capture records. A damaged state file is moved aside and reported, never silently discarded. */
export function loadAll(): LoadResult {
  const warnings: string[] = [];
  let queue: QueueEntry[];
  try {
    queue = readJournal(warnings);
  } catch (e) {
    warnings.push(`Saved capture records could not be read (${e instanceof Error ? e.message : String(e)}).`);
    queue = [];
  }

  const file = new File(Paths.document, STATE_FILE);
  if (!file.exists) return { status: "NONE", queue, warnings };
  let text: string;
  try {
    text = file.textSync();
  } catch (e) {
    return { status: "UNREADABLE", error: `read failed: ${e instanceof Error ? e.message : String(e)}`, savedAside: null, queue, warnings };
  }
  const r = parse(text);
  if (!r.ok) {
    const aside = new File(Paths.document, `astig-state.unreadable-${Date.now()}.json`);
    try {
      file.moveSync(aside);
      return { status: "UNREADABLE", error: r.error, savedAside: aside.uri, queue, warnings };
    } catch {
      return { status: "UNREADABLE", error: r.error, savedAside: null, queue, warnings };
    }
  }

  // v1 kept capture records inside the state file: move them into the journal once.
  if (r.legacyQueue && r.legacyQueue.length > 0) {
    const known = new Set(queue.map(entryKey));
    const missing = r.legacyQueue.filter((e) => !known.has(entryKey(e)));
    if (missing.length > 0) appendText(encodeEntries(missing));
    queue = [...missing, ...queue];
  }
  const data: AppData = { ...r.state, session: reconcileSequence(r.state.session, queue), queue };
  if (r.legacyQueue) saveState(data); // rewrite as v2 so the records are not migrated twice
  return { status: "OK", data, warnings };
}

const entryKey = (e: QueueEntry) => (e.kind === "CAPTURED" ? `C:${e.request.clientObservationId}` : `F:${e.clientSessionId}:${e.attemptedAt}:${e.reason}`);

function appendText(text: string): void {
  const f = journalFile();
  if (!f.exists) f.create();
  f.write(text, { append: true });
}

/** Append one capture record. Throws if the phone refuses the write; the caller reports it. */
export function appendEntry(entry: QueueEntry): void {
  appendText(encodeEntry(entry));
}

/** Write to a temporary file, then replace, so a crash mid-write cannot leave a half-written state file. */
export function saveState(state: PersistedState | AppData): number {
  const text = serialize(state);
  const tmp = new File(Paths.document, STATE_TMP);
  if (tmp.exists) tmp.delete();
  tmp.create();
  tmp.write(text);
  tmp.moveSync(new File(Paths.document, STATE_FILE), { overwrite: true });
  return text.length;
}

/**
 * Move a just-taken image out of the cache (which Android may clear) into the app's
 * private capture folder, named by its clientObservationId. Returns the new URI and size.
 */
export function keepImage(uri: string, clientObservationId: string): { uri: string; bytes: number | null } {
  const dir = new Directory(Paths.document, CAPTURE_DIR);
  if (!dir.exists) dir.create({ intermediates: true });
  const target = new File(dir, `${clientObservationId}.jpg`);
  const src = new File(uri);
  src.moveSync(target, { overwrite: true });
  let bytes: number | null = null;
  try {
    bytes = target.size;
  } catch {
    bytes = null;
  }
  return { uri: target.uri, bytes };
}

/** Free space on the phone's internal storage, or null if it cannot be read. */
export function freeBytes(): number | null {
  try {
    const n = Paths.availableDiskSpace;
    return Number.isFinite(n) && n >= 0 ? n : null;
  } catch {
    return null;
  }
}
