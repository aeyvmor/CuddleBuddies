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
  /** Receiver-reported ground speed in m/s (from Doppler, not from position differences); null if not reported. */
  speedMps?: number | null;
}

/**
 * Speed-integrated GPS distance, for vehicle travel (the PUV case).
 * Position differences jitter by metres even when parked, and a 7 m interval is
 * about the size of that jitter. Receiver speed is far steadier and reads near
 * zero when stopped, so distance is taken as speed x time between fixes.
 */
export interface GpsSpeedConfig {
  /** Below this the vehicle is treated as stopped (parked, loading, at a light). Crawling slower than this is not counted. */
  minSpeedMps: number;
  /** A gap between fixes longer than this is not bridged; its duration is reported instead of guessed. */
  maxGapS: number;
  /** How long the last reported speed may be projected forward between fixes for the capture trigger. */
  maxProjectS: number;
}

export const DEFAULT_GPS_SPEED_CONFIG: GpsSpeedConfig = { minSpeedMps: 1.0, maxGapS: 5, maxProjectS: 2 };

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
  /** Speed-integrated distance over accepted fixes (see GpsSpeedConfig). */
  speedM: number;
  /** Seconds between accepted fixes that were too far apart to bridge. */
  speedGapS: number;
  /** Accepted fixes that carried no speed. */
  fixesWithoutSpeed: number;
}

export const initialGpsState: GpsDistanceState = {
  rawM: 0,
  filteredM: 0,
  fixes: 0,
  rejectedFixes: 0,
  last: null,
  lastAccepted: null,
  speedM: 0,
  speedGapS: 0,
  fixesWithoutSpeed: 0,
};

const validSpeed = (f: GpsFix | null): number | null => (f && typeof f.speedMps === "number" && f.speedMps >= 0 ? f.speedMps : null);

/**
 * Two accumulators over the same fixes. "filtered" drops fixes whose reported
 * accuracy is unknown or worse than maxAccuracyM; it does not smooth. The spike
 * reports both so the walk test shows how much of the raw sum is jitter.
 */
export function addGpsFix(
  state: GpsDistanceState,
  fix: GpsFix,
  maxAccuracyM: number,
  speedCfg: GpsSpeedConfig = DEFAULT_GPS_SPEED_CONFIG,
): GpsDistanceState {
  const rawStep = state.last ? haversineM(state.last, fix) : 0;
  const acceptable = fix.accuracyM !== null && fix.accuracyM <= maxAccuracyM;
  const filteredStep = acceptable && state.lastAccepted ? haversineM(state.lastAccepted, fix) : 0;
  // Speed integration: trapezoid between consecutive accepted fixes that both report a speed.
  let speedStep = 0;
  let gapS = 0;
  const v1 = validSpeed(fix);
  if (acceptable && state.lastAccepted) {
    const dtS = (fix.timestampMs - state.lastAccepted.timestampMs) / 1000;
    const v0 = validSpeed(state.lastAccepted);
    if (dtS > speedCfg.maxGapS) gapS = dtS;
    else if (dtS > 0 && v0 !== null && v1 !== null) {
      const v = (v0 + v1) / 2;
      if (v >= speedCfg.minSpeedMps) speedStep = v * dtS;
    }
  }
  return {
    speedM: state.speedM + speedStep,
    speedGapS: state.speedGapS + gapS,
    fixesWithoutSpeed: state.fixesWithoutSpeed + (acceptable && v1 === null ? 1 : 0),
    rawM: state.rawM + rawStep,
    filteredM: state.filteredM + filteredStep,
    fixes: state.fixes + 1,
    rejectedFixes: state.rejectedFixes + (acceptable ? 0 : 1),
    last: fix,
    lastAccepted: acceptable ? fix : state.lastAccepted,
  };
}

/**
 * Speed-integrated distance projected to `nowMs`, so a capture trigger does not have to
 * wait for the next 1 Hz fix (at 30 km/h a vehicle covers 8 m between fixes). The projection
 * is bounded and is replaced by the integrated value when the next fix arrives.
 */
export function gpsSpeedLiveM(state: GpsDistanceState, nowMs: number, cfg: GpsSpeedConfig = DEFAULT_GPS_SPEED_CONFIG): number {
  const v = validSpeed(state.lastAccepted);
  if (!state.lastAccepted || v === null || v < cfg.minSpeedMps) return state.speedM;
  const aheadS = Math.min(Math.max((nowMs - state.lastAccepted.timestampMs) / 1000, 0), cfg.maxProjectS);
  return state.speedM + v * aheadS;
}

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export type VioTracking = "NORMAL" | "LIMITED" | "UNAVAILABLE";

/**
 * Minimum horizontal displacement before the stepped accumulator counts a step.
 * Summing every pose update (30-60 per second) also sums hand sway and tracking
 * jitter, which inflated a 10 m indoor trial to 14.7 m. Stepping ignores movement
 * smaller than this, at the cost of slightly under-reading a curved path.
 */
export const VIO_MIN_STEP_M = 0.25;

/**
 * Straight-line (net) horizontal displacement from an anchor point. Unlike a path
 * sum it does not grow when the phone is panned or swung in place: the camera
 * wobbles around the same spot and the displacement stays small.
 * ARCore may re-origin its world after a tracking loss, so the displacement
 * reached before a loss is banked and the anchor is re-taken afterwards.
 */
export interface NetTracker {
  anchor: Vec3 | null;
  bankedM: number;
}

const emptyNet: NetTracker = { anchor: null, bankedM: 0 };
const horizontal = (a: Vec3, b: Vec3) => Math.hypot(b.x - a.x, b.z - a.z);

export function netM(n: NetTracker, current: Vec3 | null): number {
  return n.bankedM + (n.anchor && current ? horizontal(n.anchor, current) : 0);
}

export interface VioDistanceState {
  /** Net displacement since the last reset. Valid as a distance only for a straight, one-way walk. */
  fromStart: NetTracker;
  /** Net displacement since the last capture; this drives the capture trigger. */
  sinceCapture: NetTracker;
  /** Horizontal (x/z plane) path length while tracking was NORMAL, summed over every pose update. Y is vertical in ARCore world space. */
  horizontalM: number;
  /** Same path, counted only in steps of at least VIO_MIN_STEP_M from the last anchor. */
  steppedM: number;
  /** Times tracking left NORMAL. Each one is a gap in measured distance. */
  trackingLosses: number;
  /** Pose updates dropped because they implied a speed above the plausibility limit. */
  rejectedJumps: number;
  /** Pose updates ignored because the motion gate said the device was not travelling. */
  gatedUpdates: number;
  /** Arrival time of the last pose, when the caller supplies one. */
  lastMs: number | null;
  tracking: VioTracking;
  last: Vec3 | null;
  /** Position of the last counted step for steppedM. */
  anchor: Vec3 | null;
}

export const initialVioState: VioDistanceState = {
  horizontalM: 0,
  steppedM: 0,
  trackingLosses: 0,
  rejectedJumps: 0,
  gatedUpdates: 0,
  lastMs: null,
  tracking: "UNAVAILABLE",
  last: null,
  anchor: null,
  fromStart: emptyNet,
  sinceCapture: emptyNet,
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
    lastMs: tracking === "NORMAL" ? state.lastMs : null,
    anchor: tracking === "NORMAL" ? state.anchor : null,
    fromStart: lost ? { anchor: null, bankedM: netM(state.fromStart, state.last) } : state.fromStart,
    sinceCapture: lost ? { anchor: null, bankedM: netM(state.sinceCapture, state.last) } : state.sinceCapture,
  };
}

/** Pose updates can arrive bunched on the JS thread; never divide by less than one frame. */
const MIN_DT_S = 0.033;

export interface PoseTiming {
  /** Arrival time of this pose in ms. */
  tMs: number;
  /** Speeds above this are treated as a tracking glitch, not movement. */
  maxSpeedMps: number;
  /**
   * Motion gate verdict from an independent sensor (src/motion.ts). False means the
   * device is not travelling, so this update's movement is ignored. Omit to leave the gate off.
   */
  moving?: boolean;
}

/**
 * With `timing`, a step that implies an implausible speed is dropped: ARCore can report
 * NORMAL tracking while its position estimate leaps. The displacement reached before the
 * leap is banked and measurement restarts from the new position, as for a tracking loss.
 */
export function addVioPose(state: VioDistanceState, p: Vec3, timing?: PoseTiming): VioDistanceState {
  if (state.tracking !== "NORMAL") return state;
  const step = state.last ? Math.hypot(p.x - state.last.x, p.z - state.last.z) : 0;
  if (timing?.moving === false) {
    // Follow the pose without counting it, so nothing is added when the gate reopens.
    const last = state.last ?? p;
    return {
      ...state,
      gatedUpdates: state.gatedUpdates + 1,
      last: p,
      lastMs: timing.tMs,
      anchor: p,
      fromStart: { anchor: p, bankedM: netM(state.fromStart, last) },
      sinceCapture: { anchor: p, bankedM: netM(state.sinceCapture, last) },
    };
  }
  if (timing && state.last && state.lastMs !== null) {
    const dtS = Math.max((timing.tMs - state.lastMs) / 1000, MIN_DT_S);
    if (step / dtS > timing.maxSpeedMps) {
      return {
        ...state,
        rejectedJumps: state.rejectedJumps + 1,
        last: p,
        lastMs: timing.tMs,
        anchor: p,
        fromStart: { anchor: p, bankedM: netM(state.fromStart, state.last) },
        sinceCapture: { anchor: p, bankedM: netM(state.sinceCapture, state.last) },
      };
    }
  }
  const fromAnchor = state.anchor ? Math.hypot(p.x - state.anchor.x, p.z - state.anchor.z) : 0;
  const counted = fromAnchor >= VIO_MIN_STEP_M;
  return {
    ...state,
    horizontalM: state.horizontalM + step,
    steppedM: state.steppedM + (counted ? fromAnchor : 0),
    last: p,
    lastMs: timing ? timing.tMs : state.lastMs,
    anchor: counted || !state.anchor ? p : state.anchor,
    fromStart: state.fromStart.anchor ? state.fromStart : { ...state.fromStart, anchor: p },
    sinceCapture: state.sinceCapture.anchor ? state.sinceCapture : { ...state.sinceCapture, anchor: p },
  };
}

/** Net displacement since the last reset (straight one-way walks only). */
export function vioNetFromStartM(state: VioDistanceState): number {
  return netM(state.fromStart, state.last);
}

/** Net displacement since the last capture. */
export function vioSinceCaptureM(state: VioDistanceState): number {
  return netM(state.sinceCapture, state.last);
}

/** Start measuring the next interval from the current position. */
export function markVioCapture(state: VioDistanceState): VioDistanceState {
  return { ...state, sinceCapture: { anchor: state.last, bankedM: 0 } };
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
