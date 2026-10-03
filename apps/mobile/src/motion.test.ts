import { test } from "node:test";
import assert from "node:assert/strict";
import { addAccel, DEFAULT_MOTION_CONFIG as CFG, initialMotionState, judgeMotion, setGpsSpeed, setGyro, type MotionState } from "./motion.ts";

/** 1.5 s of accelerometer samples at 20 Hz: gravity plus a vertical bounce of the given amplitude at 2 Hz. */
function withAccel(state: MotionState, bounceG: number, endMs = 1500): MotionState {
  let s = state;
  for (let t = endMs - 1500; t <= endMs; t += 50) s = addAccel(s, t, 0, 0, 1 + bounceG * Math.sin((2 * Math.PI * 2 * t) / 1000), CFG.windowMs);
  return s;
}

test("standing still with a slow pan is not movement", () => {
  const s = setGyro(withAccel(initialMotionState, 0.02), 1500, 0, 0.4, 0);
  assert.deepEqual(judgeMotion(s, 1500), { moving: false, reason: "STILL" });
});

test("a walking bounce with the phone held steady is movement", () => {
  const s = setGyro(withAccel(initialMotionState, 0.35), 1500, 0, 0.2, 0);
  assert.deepEqual(judgeMotion(s, 1500), { moving: true, reason: "WALKING_BOUNCE" });
});

test("fast rotation vetoes movement even with bounce or GPS speed", () => {
  let s = setGyro(withAccel(initialMotionState, 0.35), 1500, 0, 2.5, 0);
  s = setGpsSpeed(s, 1500, 8);
  assert.deepEqual(judgeMotion(s, 1500), { moving: false, reason: "ROTATING" });
});

test("GPS speed counts as movement without any bounce (smooth vehicle travel)", () => {
  let s = setGyro(withAccel(initialMotionState, 0.01), 1500, 0, 0.05, 0);
  s = setGpsSpeed(s, 1500, 6);
  assert.deepEqual(judgeMotion(s, 1500), { moving: true, reason: "GPS_SPEED" });
});

test("an unreported GPS speed is ignored, not treated as zero or as movement", () => {
  let s = setGyro(withAccel(initialMotionState, 0.35), 1500, 0, 0.2, 0);
  s = setGpsSpeed(s, 1500, null);
  assert.deepEqual(judgeMotion(s, 1500), { moving: true, reason: "WALKING_BOUNCE" });
  assert.equal(setGpsSpeed(s, 1500, -1).gps, null);
});

test("missing or stale sensor data fails closed", () => {
  assert.deepEqual(judgeMotion(initialMotionState, 0), { moving: false, reason: "NO_SENSOR_DATA" });
  const stale = setGyro(withAccel(initialMotionState, 0.35), 1500, 0, 0.2, 0);
  assert.deepEqual(judgeMotion(stale, 1500 + CFG.staleMs + 1), { moving: false, reason: "NO_SENSOR_DATA" });
});
