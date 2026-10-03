/**
 * Saved app state: format and validation. Pure, tested without a device. The file
 * read/write itself is in src/storage.ts.
 *
 * v2 keeps the session and settings in a small state file; capture records live in an
 * append-only journal (src/journal.ts), so a long route does not rewrite every record
 * on every capture. v1 files (queue inside the state file) are still read, for migration.
 *
 * Unreadable saved data is reported, never silently replaced by an empty state.
 */
import type { QueueEntry } from "./queue.ts";
import type { SessionState } from "./session.ts";

export const PERSIST_VERSION = "astig-mobile-state.v2";
export const LEGACY_PERSIST_VERSION = "astig-mobile-state.v1";

export interface PersistedState {
  version: typeof PERSIST_VERSION;
  savedAt: string;
  session: SessionState;
  recentDeviceLabels: string[];
  recentVehicleLabels: string[];
  /** Distance shown on the active screen when saved; carried forward after a restart. */
  lastDistanceM: number;
}

/** What the app holds in memory: the saved state plus the capture records read from the journal. */
export interface AppData extends PersistedState {
  queue: QueueEntry[];
}

export function emptyPersisted(now: Date): PersistedState {
  return {
    version: PERSIST_VERSION,
    savedAt: now.toISOString(),
    session: { phase: "IDLE" },
    recentDeviceLabels: [],
    recentVehicleLabels: [],
    lastDistanceM: 0,
  };
}

/** The state file never contains capture records; those go to the journal. */
export function serialize(data: PersistedState | AppData): string {
  const { version, savedAt, session, recentDeviceLabels, recentVehicleLabels, lastDistanceM } = data;
  return JSON.stringify({ version, savedAt, session, recentDeviceLabels, recentVehicleLabels, lastDistanceM });
}

export type ParseResult =
  | { ok: true; state: PersistedState; /** Records found in a v1 file, to be moved into the journal. */ legacyQueue: QueueEntry[] | null }
  | { ok: false; error: string };

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const isStrArray = (v: unknown): v is string[] => Array.isArray(v) && v.every((x) => typeof x === "string");
const PHASES = ["IDLE", "ACTIVE", "STOPPING", "ENDED"];

function checkSession(v: unknown): string | null {
  if (!isObj(v) || typeof v.phase !== "string" || !PHASES.includes(v.phase)) return "session phase";
  if (v.phase === "IDLE") return null;
  const s = v.session;
  if (!isObj(s) || typeof s.clientSessionId !== "string" || typeof s.startedAt !== "string" || !isObj(s.config)) return "session record";
  if (typeof s.nextSequence !== "number" || !Array.isArray(s.gaps)) return "session counters";
  return null;
}

/** Shape check for one capture record (state file v1 or a journal line). */
export function checkEntry(e: unknown): e is QueueEntry {
  if (!isObj(e) || typeof e.clientSessionId !== "string") return false;
  if (e.kind === "FAILED") return typeof e.reason === "string" && typeof e.attemptedAt === "string";
  if (e.kind === "CAPTURED") {
    return isObj(e.request) && typeof e.request.sequenceNumber === "number" && isObj(e.image) && typeof e.image.uri === "string" && isObj(e.upload);
  }
  return false;
}

export function parse(text: string): ParseResult {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, error: "not valid JSON" };
  }
  if (!isObj(raw)) return { ok: false, error: "not an object" };
  const legacy = raw.version === LEGACY_PERSIST_VERSION;
  if (raw.version !== PERSIST_VERSION && !legacy) return { ok: false, error: `unknown version ${String(raw.version)}` };
  if (typeof raw.savedAt !== "string" || Number.isNaN(Date.parse(raw.savedAt))) return { ok: false, error: "savedAt" };
  const sessionError = checkSession(raw.session);
  if (sessionError) return { ok: false, error: sessionError };
  if (legacy && (!Array.isArray(raw.queue) || !raw.queue.every(checkEntry))) return { ok: false, error: "queue entries" };
  if (!isStrArray(raw.recentDeviceLabels) || !isStrArray(raw.recentVehicleLabels)) return { ok: false, error: "recent labels" };
  if (typeof raw.lastDistanceM !== "number" || !(raw.lastDistanceM >= 0)) return { ok: false, error: "lastDistanceM" };
  const state: PersistedState = {
    version: PERSIST_VERSION,
    savedAt: raw.savedAt,
    session: raw.session as SessionState,
    recentDeviceLabels: raw.recentDeviceLabels,
    recentVehicleLabels: raw.recentVehicleLabels,
    lastDistanceM: raw.lastDistanceM,
  };
  return { ok: true, state, legacyQueue: legacy ? (raw.queue as QueueEntry[]) : null };
}
