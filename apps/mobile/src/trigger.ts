/**
 * Capture-trigger decisions for a session. This does not measure distance itself:
 * it calls the existing accumulators in src/distance.ts, exactly as the diagnostics
 * screen does (GPS: speed-integrated distance projected between fixes; AR: net
 * displacement since the last capture). The trigger is distance-based only; there is
 * no timer anywhere in it.
 */
import { gpsSpeedLiveM, markVioCapture, shouldCapture, vioSinceCaptureM, type GpsDistanceState, type GpsFix, type VioDistanceState } from "./distance.ts";
import type { DistanceSource } from "./sources.ts";

export interface TriggerState {
  /** GPS speed distance total at the previous distance-triggered capture. */
  gpsAtLastCaptureM: number;
  /** AR distance already counted by previous captures (sum of their distanceFromPreviousM). */
  vioCountedM: number;
}

export const initialTrigger: TriggerState = { gpsAtLastCaptureM: 0, vioCountedM: 0 };

export interface DistanceView {
  /** Distance counted by the chosen source since the live counters started; null when the source measures none. */
  totalM: number | null;
  sinceCaptureM: number | null;
}

export function distanceView(source: DistanceSource, gps: GpsDistanceState, vio: VioDistanceState, trigger: TriggerState, nowMs: number): DistanceView {
  if (source === "GPS_SPEED") {
    const total = gpsSpeedLiveM(gps, nowMs);
    return { totalM: total, sinceCaptureM: Math.max(0, total - trigger.gpsAtLastCaptureM) };
  }
  if (source === "AR_VIO") {
    const since = vioSinceCaptureM(vio);
    return { totalM: trigger.vioCountedM + since, sinceCaptureM: since };
  }
  return { totalM: null, sinceCaptureM: null };
}

export type TriggerDecision =
  | { fire: false }
  | { fire: true; distanceFromPreviousM: number; trigger: TriggerState; vio: VioDistanceState };

/** Decide whether the distance trigger fires now, and the counter state after it does. */
export function checkTrigger(
  source: DistanceSource,
  intervalM: number,
  gps: GpsDistanceState,
  vio: VioDistanceState,
  trigger: TriggerState,
  nowMs: number,
): TriggerDecision {
  if (source === "MANUAL_ONLY") return { fire: false };
  const view = distanceView(source, gps, vio, trigger, nowMs);
  const since = view.sinceCaptureM ?? 0;
  if (!shouldCapture(since, 0, intervalM)) return { fire: false };
  if (source === "GPS_SPEED") {
    return { fire: true, distanceFromPreviousM: since, trigger: { ...trigger, gpsAtLastCaptureM: view.totalM ?? 0 }, vio };
  }
  return { fire: true, distanceFromPreviousM: since, trigger: { ...trigger, vioCountedM: trigger.vioCountedM + since }, vio: markVioCapture(vio) };
}

/** A fix older than this is not attached to a capture. */
export const MAX_FIX_AGE_MS = 10_000;

/**
 * The latest fix if it is recent enough to say where a photo was taken; otherwise null,
 * so buildCaptureRequest refuses the capture (NO_LOCATION_FIX) instead of using a stale position.
 */
export function freshFix(fix: GpsFix | null, nowMs: number, maxAgeMs = MAX_FIX_AGE_MS): GpsFix | null {
  if (!fix) return null;
  return nowMs - fix.timestampMs <= maxAgeMs ? fix : null;
}
