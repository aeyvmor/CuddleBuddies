import { test } from "node:test";
import assert from "node:assert/strict";
import { addGpsFix, addVioPose, initialGpsState, initialVioState, setVioTracking, type GpsDistanceState } from "./distance.ts";
import { checkTrigger, distanceView, freshFix, initialTrigger, MAX_FIX_AGE_MS } from "./trigger.ts";

/** A vehicle at a steady speed, one accurate fix per second. */
function driving(speedMps: number, seconds: number): GpsDistanceState {
  let g = initialGpsState;
  for (let s = 0; s <= seconds; s++) g = addGpsFix(g, { latitude: 14.6, longitude: 121 + s * 1e-5, accuracyM: 5, timestampMs: s * 1000, speedMps }, 20);
  return g;
}

test("GPS speed: fires once the interval is travelled, with the distance since the last capture", () => {
  const g = driving(5, 1); // 5 m integrated
  assert.deepEqual(checkTrigger("GPS_SPEED", 7, g, initialVioState, initialTrigger, 1000), { fire: false });
  const g2 = driving(5, 2); // 10 m integrated
  const d = checkTrigger("GPS_SPEED", 7, g2, initialVioState, initialTrigger, 2000);
  assert.ok(d.fire);
  assert.equal(d.distanceFromPreviousM, 10);
  assert.equal(d.trigger.gpsAtLastCaptureM, 10);
  // Immediately after, nothing more has been travelled.
  assert.deepEqual(checkTrigger("GPS_SPEED", 7, g2, initialVioState, d.trigger, 2000), { fire: false });
});

test("GPS speed: a parked vehicle never triggers, however long it waits", () => {
  const g = driving(0.2, 600);
  assert.deepEqual(checkTrigger("GPS_SPEED", 7, g, initialVioState, initialTrigger, 600_000), { fire: false });
});

test("manual only never fires a distance capture and shows no distance", () => {
  assert.deepEqual(checkTrigger("MANUAL_ONLY", 7, driving(10, 30), initialVioState, initialTrigger, 30_000), { fire: false });
  assert.deepEqual(distanceView("MANUAL_ONLY", driving(10, 30), initialVioState, initialTrigger, 30_000), { totalM: null, sinceCaptureM: null });
});

test("AR: fires on net displacement and re-anchors at the capture point", () => {
  let v = setVioTracking(initialVioState, "NORMAL");
  v = addVioPose(v, { x: 0, y: 0, z: 0 });
  v = addVioPose(v, { x: 0, y: 0, z: -7.5 });
  const d = checkTrigger("AR_VIO", 7, initialGpsState, v, initialTrigger, 0);
  assert.ok(d.fire);
  assert.equal(d.distanceFromPreviousM, 7.5);
  assert.equal(d.trigger.vioCountedM, 7.5);
  assert.deepEqual(checkTrigger("AR_VIO", 7, initialGpsState, d.vio, d.trigger, 0), { fire: false });
  assert.equal(distanceView("AR_VIO", initialGpsState, d.vio, d.trigger, 0).totalM, 7.5);
});

test("AR: movement ignored by the motion gate does not count toward the trigger", () => {
  let v = setVioTracking(initialVioState, "NORMAL");
  v = addVioPose(v, { x: 0, y: 0, z: 0 }, { tMs: 0, maxSpeedMps: 3, moving: false });
  v = addVioPose(v, { x: 0, y: 0, z: -2 }, { tMs: 1000, maxSpeedMps: 3, moving: false });
  v = addVioPose(v, { x: 0, y: 0, z: -4 }, { tMs: 2000, maxSpeedMps: 3, moving: false });
  assert.deepEqual(checkTrigger("AR_VIO", 2, initialGpsState, v, initialTrigger, 2000), { fire: false });
});

test("a stale fix is not attached to a capture", () => {
  const fix = { latitude: 14.6, longitude: 121, accuracyM: 5, timestampMs: 0 };
  assert.equal(freshFix(fix, MAX_FIX_AGE_MS), fix);
  assert.equal(freshFix(fix, MAX_FIX_AGE_MS + 1), null);
  assert.equal(freshFix(null, 0), null);
});
