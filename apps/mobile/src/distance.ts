/**
 * SPIKE: travelled-distance accumulators. Pure functions so they can be tested
 * without a device. Names follow the draft contract's samplingMethod values
 * (packages/contracts/src/observation.ts) but the contract is NOT imported.
 *
 * GPS_DISTANCE and VIO_DISTANCE are kept strictly separate. Nothing here falls
 * back from one to the other.
 */

export type SpikeSamplingMethod = "VIO_DISTANCE" | "GPS_DISTANCE";

export interface GpsFix {
  latitude: number;
  longitude: number;
  /** Device-reported horizontal accuracy in metres, or null if not reported. */
  accuracyM: number | null;
  /** Epoch ms from the fix itself, not from the JS clock. */
  timestampMs: number;
}

const EARTH_RADIUS_M = 6_371_008.8;

export function haversineM(a: { latitude: number; longitude: number }, b: { latitude: number; longitude: number }): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.latitude - a.latitude);
  const dLon = toRad(b.longitude - a.longitude);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.latitude)) * Math.cos(toRad(b.latitude)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

export interface GpsDistanceState {
  /** Sum of every step between consecutive fixes, no filtering. Shows raw jitter. */
  rawM: number;
  /** Sum of steps where both fixes have accuracy <= maxAccuracyM. */
  filteredM: number;
  fixes: number;
  rejectedFixes: number;
  last: GpsFix | null;
  lastAccepted: GpsFix | null;
}

export const initialGpsState: GpsDistanceState = {
  rawM: 0,
  filteredM: 0,
  fixes: 0,
  rejectedFixes: 0,
  last: null,
  lastAccepted: null,
};

/**
 * Two accumulators over the same fixes. "filtered" drops fixes whose reported
 * accuracy is unknown or worse than maxAccuracyM; it does not smooth. The spike
 * reports both so the walk test shows how much of the raw sum is jitter.
 */
export function addGpsFix(state: GpsDistanceState, fix: GpsFix, maxAccuracyM: number): GpsDistanceState {
  const rawStep = state.last ? haversineM(state.last, fix) : 0;
  const acceptable = fix.accuracyM !== null && fix.accuracyM <= maxAccuracyM;
  const filteredStep = acceptable && state.lastAccepted ? haversineM(state.lastAccepted, fix) : 0;
  return {
    rawM: state.rawM + rawStep,
    filteredM: state.filteredM + filteredStep,
    fixes: state.fixes + 1,
    rejectedFixes: state.rejectedFixes + (acceptable ? 0 : 1),
    last: fix,
    lastAccepted: acceptable ? fix : state.lastAccepted,
  };
}

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export type VioTracking = "NORMAL" | "LIMITED" | "UNAVAILABLE";

export interface VioDistanceState {
  /** Horizontal (x/z plane) path length while tracking was NORMAL. Y is vertical in ARCore world space. */
  horizontalM: number;
  /** Times tracking left NORMAL. Each one is a gap in measured distance. */
  trackingLosses: number;
  tracking: VioTracking;
  last: Vec3 | null;
}

export const initialVioState: VioDistanceState = {
  horizontalM: 0,
  trackingLosses: 0,
  tracking: "UNAVAILABLE",
  last: null,
};

/** Only NORMAL tracking contributes. After a loss, the next NORMAL pose re-anchors without adding a step. */
export function setVioTracking(state: VioDistanceState, tracking: VioTracking): VioDistanceState {
  if (tracking === state.tracking) return state;
  const lost = state.tracking === "NORMAL" && tracking !== "NORMAL";
  return {
    ...state,
    tracking,
    trackingLosses: state.trackingLosses + (lost ? 1 : 0),
    last: tracking === "NORMAL" ? state.last : null,
  };
}

export function addVioPose(state: VioDistanceState, p: Vec3): VioDistanceState {
  if (state.tracking !== "NORMAL") return state;
  const step = state.last ? Math.hypot(p.x - state.last.x, p.z - state.last.z) : 0;
  return { ...state, horizontalM: state.horizontalM + step, last: p };
}

/** Distance-based trigger: true when travelled distance since the last capture reaches the interval. */
export function shouldCapture(totalM: number, lastCaptureAtM: number, intervalM: number): boolean {
  if (!(intervalM > 0)) throw new RangeError("intervalM must be > 0");
  return totalM - lastCaptureAtM >= intervalM;
}

/** Signed percentage error versus a tape-measured reference distance. */
export function percentError(measuredM: number, referenceM: number): number {
  if (!(referenceM > 0)) throw new RangeError("referenceM must be > 0");
  return ((measuredM - referenceM) / referenceM) * 100;
}
