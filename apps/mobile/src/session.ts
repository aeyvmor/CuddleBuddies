/**
 * Session lifecycle and setup validation. Pure functions, tested without a device.
 *
 * Phases: IDLE -> ACTIVE -> STOPPING -> ENDED -> (reset) IDLE.
 * STOPPING means the operator confirmed Stop and the app is letting an in-flight
 * capture settle; no new capture starts in STOPPING.
 *
 * The session is local: there is no upload or session registration in this build.
 * Field names that will go to the API later (clientSessionId, startedAt, endedAt,
 * startLocation) follow packages/contracts/src/session.ts.
 */
import { uuidV4 } from "./capture.ts";
import { SOURCES, type DistanceSource } from "./sources.ts";

export type SessionPhase = "IDLE" | "ACTIVE" | "STOPPING" | "ENDED";

export interface SessionConfig {
  /** Local label only. The contract needs a registered deviceId UUID; there is no lookup route yet. */
  deviceLabel: string;
  /** Local label only, as for deviceLabel. */
  vehicleLabel: string;
  /** Capture interval in metres (contract has no field for it yet: README contract gap 3). */
  intervalM: number;
  source: DistanceSource;
}

export type GapReason = "BACKGROUND" | "APP_NOT_RUNNING";

/** A span in which nothing was measured or captured. `to` is null while still open. */
export interface Gap {
  reason: GapReason;
  from: string;
  to: string | null;
}

export interface SessionRecord {
  clientSessionId: string;
  config: SessionConfig;
  startedAt: string;
  endedAt: string | null;
  /** First GPS fix of the session; the contract requires one to register the session. */
  startLocation: { latitude: number; longitude: number } | null;
  /** Next contract sequenceNumber. Failures do not consume one. */
  nextSequence: number;
  gaps: Gap[];
  /** Distance shown before the app process last restarted; live counters start again from zero. */
  distanceCarriedM: number;
}

export type SessionState =
  | { phase: "IDLE" }
  | { phase: "ACTIVE" | "STOPPING" | "ENDED"; session: SessionRecord };

export const IDLE: SessionState = { phase: "IDLE" };

const illegal = (action: string, phase: SessionPhase) => new Error(`cannot ${action} in phase ${phase}`);

export function startSession(state: SessionState, config: SessionConfig, now: Date, random?: () => number): SessionState {
  if (state.phase !== "IDLE") throw illegal("start", state.phase);
  return {
    phase: "ACTIVE",
    session: {
      clientSessionId: uuidV4(random),
      config,
      startedAt: now.toISOString(),
      endedAt: null,
      startLocation: null,
      nextSequence: 0,
      gaps: [],
      distanceCarriedM: 0,
    },
  };
}

export function beginStop(state: SessionState): SessionState {
  if (state.phase !== "ACTIVE") throw illegal("stop", state.phase);
  return { phase: "STOPPING", session: state.session };
}

export function finishStop(state: SessionState, now: Date): SessionState {
  if (state.phase !== "STOPPING") throw illegal("finish stopping", state.phase);
  const at = now.toISOString();
  return { phase: "ENDED", session: { ...closeGaps(state.session, at), endedAt: at } };
}

export function resetToIdle(state: SessionState): SessionState {
  if (state.phase !== "ENDED") throw illegal("reset", state.phase);
  return IDLE;
}

const closeGaps = (s: SessionRecord, at: string): SessionRecord =>
  s.gaps.some((g) => g.to === null) ? { ...s, gaps: s.gaps.map((g) => (g.to === null ? { ...g, to: at } : g)) } : s;

const isRunning = (state: SessionState): state is { phase: "ACTIVE" | "STOPPING"; session: SessionRecord } =>
  state.phase === "ACTIVE" || state.phase === "STOPPING";

/**
 * Interruptions this close together count as one pause (for example the app leaving the
 * screen for a second and then being stopped). Nothing is lost: the merged pause covers
 * both spans and the time between them.
 */
export const GAP_MERGE_MS = 5_000;

/** Add a gap starting at `from`, or extend the previous gap if it ended less than GAP_MERGE_MS before. */
function openOrExtend(gaps: Gap[], reason: GapReason, from: string, to: string | null): Gap[] {
  const last = gaps[gaps.length - 1];
  if (last && last.to !== null && Date.parse(from) - Date.parse(last.to) < GAP_MERGE_MS) {
    const merged: Gap = { reason: reason === "APP_NOT_RUNNING" ? reason : last.reason, from: last.from, to };
    return [...gaps.slice(0, -1), merged];
  }
  return [...gaps, { reason, from, to }];
}

/** The app went to the background: camera and location stop, so measuring stops. */
export function markBackground(state: SessionState, now: Date): SessionState {
  if (!isRunning(state) || state.session.gaps.some((g) => g.to === null)) return state;
  return { ...state, session: { ...state.session, gaps: openOrExtend(state.session.gaps, "BACKGROUND", now.toISOString(), null) } };
}

export function markForeground(state: SessionState, now: Date): SessionState {
  if (!isRunning(state)) return state;
  return { ...state, session: closeGaps(state.session, now.toISOString()) };
}

/**
 * The app process restarted with a running session on disk. Record the time it was
 * not running as a gap, and carry the last shown distance forward.
 * One interruption is one gap: if the app went to the background and was then stopped,
 * the open background gap is extended to now (and marked APP_NOT_RUNNING) instead of
 * adding a second gap.
 */
export function resumeAfterRestart(state: SessionState, savedAt: Date, lastDistanceM: number, now: Date): SessionState {
  if (!isRunning(state)) return state;
  const s = state.session;
  const open = s.gaps.findIndex((g) => g.to === null);
  const gaps: Gap[] =
    open >= 0
      ? s.gaps.map((g, i) => (i === open ? { ...g, reason: "APP_NOT_RUNNING", to: now.toISOString() } : g))
      : openOrExtend(s.gaps, "APP_NOT_RUNNING", savedAt.toISOString(), now.toISOString());
  return { ...state, session: { ...s, gaps, distanceCarriedM: Math.max(0, lastDistanceM) } };
}

export function setStartLocation(state: SessionState, fix: { latitude: number; longitude: number }): SessionState {
  if (!isRunning(state) || state.session.startLocation) return state;
  return { ...state, session: { ...state.session, startLocation: { latitude: fix.latitude, longitude: fix.longitude } } };
}

/** Called when a capture record has been stored with this sequence number. */
export function consumeSequence(state: SessionState, used: number): SessionState {
  if (state.phase === "IDLE") return state;
  return { ...state, session: { ...state.session, nextSequence: Math.max(state.session.nextSequence, used + 1) } };
}

export function elapsedMs(s: SessionRecord, now: Date): number {
  const end = s.endedAt ? Date.parse(s.endedAt) : now.getTime();
  return Math.max(0, end - Date.parse(s.startedAt));
}

export function gapMs(s: SessionRecord, now: Date): number {
  return s.gaps.reduce((sum, g) => sum + Math.max(0, (g.to ? Date.parse(g.to) : now.getTime()) - Date.parse(g.from)), 0);
}

/** "01:02:03" (hours always shown, as on a dashboard clock). */
export function formatElapsed(ms: number): string {
  const total = Math.floor(ms / 1000);
  const two = (n: number) => String(n).padStart(2, "0");
  return `${two(Math.floor(total / 3600))}:${two(Math.floor((total % 3600) / 60))}:${two(total % 60)}`;
}

/** "640 m" below 1 km, "1.25 km" above. */
export function formatDistance(m: number): { value: string; unit: "m" | "km" } {
  if (m < 1000) return { value: String(Math.floor(m)), unit: "m" };
  return { value: (m / 1000).toFixed(m < 10_000 ? 2 : 1), unit: "km" };
}

// ----------------------------------------------------------------- setup validation

export const DEFAULT_INTERVAL_M = 7;
export const MIN_INTERVAL_M = 2;
export const MAX_INTERVAL_M = 50;
export const MAX_LABEL_LENGTH = 60;

export interface SetupInput {
  deviceLabel: string;
  vehicleLabel: string;
  intervalM: string;
  source: DistanceSource | null;
}

export type SetupField = keyof SetupInput;
export type SetupResult = { ok: true; config: SessionConfig } | { ok: false; errors: Partial<Record<SetupField, string>> };

const CONTROL_CHARS = /[\u0000-\u001f\u007f]/;

function checkLabel(raw: string, what: string): string | null {
  const v = raw.trim();
  if (v.length === 0) return `Enter a ${what} label.`;
  if (v.length > MAX_LABEL_LENGTH) return `Keep the ${what} label to ${MAX_LABEL_LENGTH} characters or fewer.`;
  if (CONTROL_CHARS.test(v)) return `The ${what} label contains characters that cannot be stored.`;
  return null;
}

export function validateSetup(input: SetupInput): SetupResult {
  const errors: Partial<Record<SetupField, string>> = {};
  const device = checkLabel(input.deviceLabel, "device");
  if (device) errors.deviceLabel = device;
  const vehicle = checkLabel(input.vehicleLabel, "vehicle");
  if (vehicle) errors.vehicleLabel = vehicle;

  const text = input.intervalM.trim().replace(",", ".");
  const n = /^\d+(\.\d)?$/.test(text) ? Number(text) : NaN;
  const needsInterval = input.source === null || SOURCES[input.source].autoCapture;
  if (needsInterval && !(n >= MIN_INTERVAL_M && n <= MAX_INTERVAL_M)) {
    errors.intervalM = `Enter a distance from ${MIN_INTERVAL_M} to ${MAX_INTERVAL_M} metres, for example 7.`;
  }
  if (input.source === null) errors.source = "Choose a distance source.";

  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return {
    ok: true,
    config: {
      deviceLabel: input.deviceLabel.trim(),
      vehicleLabel: input.vehicleLabel.trim(),
      intervalM: needsInterval ? n : DEFAULT_INTERVAL_M,
      source: input.source!,
    },
  };
}

/** Step the interval field by `delta` metres, clamped to the allowed range. */
export function stepInterval(current: string, delta: number): string {
  const n = Number(current.trim().replace(",", "."));
  const base = Number.isFinite(n) ? n : DEFAULT_INTERVAL_M;
  const next = Math.min(MAX_INTERVAL_M, Math.max(MIN_INTERVAL_M, Math.round(base + delta)));
  return String(next);
}

/** Most recent first, case-insensitive de-duplication, at most `max`. */
export function rememberLabel(list: string[], label: string, max = 5): string[] {
  const v = label.trim();
  if (!v) return list.slice(0, max);
  return [v, ...list.filter((l) => l.toLowerCase() !== v.toLowerCase())].slice(0, max);
}
