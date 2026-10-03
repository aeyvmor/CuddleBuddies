/**
 * Saved app state: format and validation. Pure, tested without a device. The file
 * read/write itself is in src/storage.ts.
 *
 * Unreadable saved data is reported, never silently replaced by an empty state.
 */
import type { QueueEntry } from "./queue.ts";
import type { SessionState } from "./session.ts";

export const PERSIST_VERSION = "astig-mobile-state.v1";

export interface PersistedState {
  version: typeof PERSIST_VERSION;
  savedAt: string;
  session: SessionState;
  queue: QueueEntry[];
  recentDeviceLabels: string[];
  recentVehicleLabels: string[];
  /** Distance shown on the active screen when saved; carried forward after a restart. */
  lastDistanceM: number;
}

export function emptyPersisted(now: Date): PersistedState {
  return {
    version: PERSIST_VERSION,
    savedAt: now.toISOString(),
    session: { phase: "IDLE" },
    queue: [],
    recentDeviceLabels: [],
    recentVehicleLabels: [],
    lastDistanceM: 0,
  };
}

export function serialize(state: PersistedState): string {
  return JSON.stringify(state);
}

export type ParseResult = { ok: true; state: PersistedState } | { ok: false; error: string };

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

function checkEntry(e: unknown): boolean {
  if (!isObj(e) || typeof e.clientSessionId !== "string") return false;
  if (e.kind === "FAILED") return typeof e.reason === "string" && typeof e.attemptedAt === "string";
  if (e.kind === "CAPTURED") return isObj(e.request) && isObj(e.image) && typeof e.image.uri === "string" && isObj(e.upload);
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
  if (raw.version !== PERSIST_VERSION) return { ok: false, error: `unknown version ${String(raw.version)}` };
  if (typeof raw.savedAt !== "string" || Number.isNaN(Date.parse(raw.savedAt))) return { ok: false, error: "savedAt" };
  const sessionError = checkSession(raw.session);
  if (sessionError) return { ok: false, error: sessionError };
  if (!Array.isArray(raw.queue) || !raw.queue.every(checkEntry)) return { ok: false, error: "queue entries" };
  if (!isStrArray(raw.recentDeviceLabels) || !isStrArray(raw.recentVehicleLabels)) return { ok: false, error: "recent labels" };
  if (typeof raw.lastDistanceM !== "number" || !(raw.lastDistanceM >= 0)) return { ok: false, error: "lastDistanceM" };
  return { ok: true, state: raw as unknown as PersistedState };
}
