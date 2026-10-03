/**
 * SPIKE: decide whether the device is really travelling, so AR (VIO) position
 * updates are only counted then. Pan-in-place tests showed the ARCore position
 * running away while the phone only rotated; this gate ignores AR output unless
 * an independent sensor agrees there is movement.
 *
 * Signals:
 * - accelerometer: walking gives a strong rhythmic bounce in total acceleration;
 *   standing still gives almost none. It cannot see steady motion (a cruising
 *   vehicle has no bounce), which is why GPS speed is accepted as an alternative.
 * - gyroscope: fast rotation vetoes AR output, since rotation without travel is
 *   where the position estimate failed.
 * Thresholds are starting values for a hand-held walking test, not product values.
 */

export interface MotionConfig {
  /** Sliding window for the bounce measurement. */
  windowMs: number;
  /** Minimum standard deviation of acceleration magnitude, in g, to count as walking. */
  minAccelStdG: number;
  /** Rotation faster than this (rad/s) vetoes AR output. */
  maxGyroRadS: number;
  /** GPS speed at or above this (m/s) counts as travelling without any bounce. */
  minGpsSpeedMps: number;
  /** A sensor reading older than this is treated as missing. */
  staleMs: number;
}

export const DEFAULT_MOTION_CONFIG: MotionConfig = {
  windowMs: 1500,
  // Hand-held walking on the test phone measured 0.05 to 0.12 g; at rest it was below 0.02 g.
  minAccelStdG: 0.04,
  maxGyroRadS: 1.0,
  minGpsSpeedMps: 1.0,
  staleMs: 1000,
};

export interface MotionState {
  /** Acceleration magnitude samples in g (gravity included), oldest first. */
  accel: { tMs: number; magG: number }[];
  gyro: { tMs: number; rateRadS: number } | null;
  gps: { tMs: number; speedMps: number } | null;
}

export const initialMotionState: MotionState = { accel: [], gyro: null, gps: null };

export function addAccel(state: MotionState, tMs: number, x: number, y: number, z: number, windowMs: number): MotionState {
  const accel = state.accel.filter((s) => tMs - s.tMs <= windowMs);
  accel.push({ tMs, magG: Math.hypot(x, y, z) });
  return { ...state, accel };
}

export function setGyro(state: MotionState, tMs: number, x: number, y: number, z: number): MotionState {
  return { ...state, gyro: { tMs, rateRadS: Math.hypot(x, y, z) } };
}

export function setGpsSpeed(state: MotionState, tMs: number, speedMps: number | null): MotionState {
  return { ...state, gps: speedMps === null || !(speedMps >= 0) ? null : { tMs, speedMps } };
}

/** Standard deviation of acceleration magnitude over the window; null with too few samples to judge. */
export function accelStdG(state: MotionState): number | null {
  const n = state.accel.length;
  if (n < 8) return null;
  const mean = state.accel.reduce((s, a) => s + a.magG, 0) / n;
  return Math.sqrt(state.accel.reduce((s, a) => s + (a.magG - mean) ** 2, 0) / n);
}

export type MotionVerdict =
  | { moving: true; reason: "WALKING_BOUNCE" | "GPS_SPEED" }
  | { moving: false; reason: "STILL" | "ROTATING" | "NO_SENSOR_DATA" };

/**
 * Missing sensor data means "not moving": the gate fails closed, so a dead sensor
 * can stop AR distance from counting but can never let unverified movement through.
 */
export function judgeMotion(state: MotionState, nowMs: number, cfg: MotionConfig = DEFAULT_MOTION_CONFIG): MotionVerdict {
  const gyro = state.gyro && nowMs - state.gyro.tMs <= cfg.staleMs ? state.gyro : null;
  const latestAccel = state.accel[state.accel.length - 1];
  const accelFresh = latestAccel !== undefined && nowMs - latestAccel.tMs <= cfg.staleMs;
  if (!gyro || !accelFresh) return { moving: false, reason: "NO_SENSOR_DATA" };
  if (gyro.rateRadS > cfg.maxGyroRadS) return { moving: false, reason: "ROTATING" };
  const gps = state.gps && nowMs - state.gps.tMs <= 3 * cfg.staleMs ? state.gps : null;
  if (gps && gps.speedMps >= cfg.minGpsSpeedMps) return { moving: true, reason: "GPS_SPEED" };
  const std = accelStdG(state);
  if (std !== null && std >= cfg.minAccelStdG) return { moving: true, reason: "WALKING_BOUNCE" };
  return { moving: false, reason: "STILL" };
}
