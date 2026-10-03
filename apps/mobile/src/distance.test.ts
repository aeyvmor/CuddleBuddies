import { test } from "node:test";
import assert from "node:assert/strict";
import {
  gpsSpeedLiveM,
  addGpsFix,
  addVioPose,
  haversineM,
  initialGpsState,
  initialVioState,
  markVioCapture,
  vioNetFromStartM,
  vioSinceCaptureM,
  percentError,
  setVioTracking,
  shouldCapture,
  type GpsFix,
} from "./distance.ts";

const fix = (lat: number, lon: number, accuracyM: number | null, t = 0): GpsFix => ({
  latitude: lat,
  longitude: lon,
  accuracyM,
  timestampMs: t,
});

test("haversine: 0.0001 deg latitude is about 11.1 m", () => {
  const d = haversineM({ latitude: 14.6, longitude: 121 }, { latitude: 14.6001, longitude: 121 });
  assert.ok(Math.abs(d - 11.12) < 0.05, `got ${d}`);
});

test("GPS: raw counts every step, filtered skips inaccurate or unknown-accuracy fixes", () => {
  let s = initialGpsState;
  s = addGpsFix(s, fix(14.6, 121, 5), 20);
  s = addGpsFix(s, fix(14.6001, 121, 50), 20); // rejected: too inaccurate
  s = addGpsFix(s, fix(14.6001, 121, null), 20); // rejected: unknown accuracy
  s = addGpsFix(s, fix(14.6002, 121, 5), 20);
  assert.equal(s.fixes, 4);
  assert.equal(s.rejectedFixes, 2);
  assert.ok(Math.abs(s.rawM - 22.24) < 0.1, `raw ${s.rawM}`);
  assert.ok(Math.abs(s.filteredM - 22.24) < 0.1, `filtered ${s.filteredM}`);
});

test("GPS: stationary jitter inflates raw distance, which is why raw GPS must not be presented as precise", () => {
  let s = initialGpsState;
  for (let i = 0; i < 10; i++) s = addGpsFix(s, fix(14.6 + (i % 2) * 0.00003, 121, 4), 20);
  assert.ok(s.rawM > 25, `stationary raw ${s.rawM}`);
});

const moving = (t: number, speedMps: number | null, accuracyM: number | null = 5): GpsFix => ({
  // Position jitters by a few metres around one point; only the speed says how far the vehicle went.
  latitude: 14.6 + (t % 2) * 0.00003,
  longitude: 121,
  accuracyM,
  timestampMs: t * 1000,
  speedMps,
});

test("GPS speed: a vehicle at steady speed covers speed x time, regardless of position jitter", () => {
  let s = initialGpsState;
  for (let t = 0; t <= 10; t++) s = addGpsFix(s, moving(t, 8), 20); // 8 m/s (about 29 km/h) for 10 s
  assert.ok(Math.abs(s.speedM - 80) < 1e-9, `speed distance ${s.speedM}`);
});

test("GPS speed: a stopped vehicle adds nothing, while position-based distance keeps growing from jitter", () => {
  let s = initialGpsState;
  for (let t = 0; t <= 30; t++) s = addGpsFix(s, moving(t, 0.2), 20); // parked: receiver reports a little speed noise
  assert.equal(s.speedM, 0);
  assert.ok(s.filteredM > 50, `position-based ${s.filteredM}`);
});

test("GPS speed: fixes without speed, inaccurate fixes and long gaps are not guessed at", () => {
  let s = initialGpsState;
  s = addGpsFix(s, moving(0, 8), 20);
  s = addGpsFix(s, moving(1, null), 20); // no speed reported: nothing added
  s = addGpsFix(s, moving(2, 8, 80), 20); // inaccurate fix: ignored
  s = addGpsFix(s, moving(3, 8), 20); // previous accepted fix had no speed: nothing added
  s = addGpsFix(s, moving(4, 8), 20); // 8 m
  s = addGpsFix(s, moving(24, 8), 20); // 20 s gap (tunnel): not bridged
  assert.equal(s.speedM, 8);
  assert.equal(s.speedGapS, 20);
  assert.equal(s.fixesWithoutSpeed, 1);
});

test("GPS speed: the live value projects the last speed forward, but only briefly and never when stopped", () => {
  let s = addGpsFix(addGpsFix(initialGpsState, moving(0, 8), 20), moving(1, 8), 20);
  assert.equal(gpsSpeedLiveM(s, 1500), 12); // 8 m integrated + 0.5 s at 8 m/s
  assert.equal(gpsSpeedLiveM(s, 60_000), 24); // capped at 2 s of projection
  s = addGpsFix(s, moving(2, 0.3), 20);
  assert.equal(gpsSpeedLiveM(s, 3500), s.speedM);
});

test("VIO: only NORMAL tracking adds horizontal distance; vertical motion is ignored", () => {
  let s = setVioTracking(initialVioState, "NORMAL");
  s = addVioPose(s, { x: 0, y: 0, z: 0 });
  s = addVioPose(s, { x: 3, y: 5, z: 4 });
  assert.equal(s.horizontalM, 5);
});

test("VIO: tracking loss counts, and re-acquisition does not add a jump", () => {
  let s = setVioTracking(initialVioState, "NORMAL");
  s = addVioPose(s, { x: 0, y: 0, z: 0 });
  s = setVioTracking(s, "LIMITED");
  s = addVioPose(s, { x: 100, y: 0, z: 0 }); // ignored while LIMITED
  s = setVioTracking(s, "NORMAL");
  s = addVioPose(s, { x: 100, y: 0, z: 0 }); // re-anchor
  s = addVioPose(s, { x: 101, y: 0, z: 0 });
  assert.equal(s.horizontalM, 1);
  assert.equal(s.trackingLosses, 1);
});

test("VIO: stepped distance ignores jitter that inflates the per-update sum", () => {
  let s = setVioTracking(initialVioState, "NORMAL");
  // 10 m straight along x in 1 cm updates, with 2 cm of side-to-side sway on every update.
  for (let i = 0; i <= 1000; i++) s = addVioPose(s, { x: i * 0.01, y: 0, z: i % 2 === 0 ? 0 : 0.02 });
  assert.ok(s.horizontalM > 20, `per-update sum ${s.horizontalM}`);
  assert.ok(Math.abs(s.steppedM - 10) < 0.3, `stepped ${s.steppedM}`);
});

test("VIO: stepped distance re-anchors after a tracking loss", () => {
  let s = setVioTracking(initialVioState, "NORMAL");
  s = addVioPose(s, { x: 0, y: 0, z: 0 });
  s = addVioPose(s, { x: 1, y: 0, z: 0 });
  s = setVioTracking(s, "UNAVAILABLE");
  s = setVioTracking(s, "NORMAL");
  s = addVioPose(s, { x: 50, y: 0, z: 0 }); // re-anchor, no jump
  s = addVioPose(s, { x: 51, y: 0, z: 0 });
  assert.equal(s.steppedM, 2);
});

test("VIO: panning in place grows the path totals but not the net displacement", () => {
  let s = setVioTracking(initialVioState, "NORMAL");
  // Camera swung on a 0.3 m arm: 20 half-turn sweeps back and forth, no walking.
  for (let sweep = 0; sweep < 20; sweep++) {
    for (let i = 0; i <= 30; i++) {
      const a = (Math.PI * (sweep % 2 === 0 ? i : 30 - i)) / 30;
      s = addVioPose(s, { x: 0.3 * Math.cos(a), y: 0, z: 0.3 * Math.sin(a) });
    }
  }
  assert.ok(s.steppedM > 10, `stepped ${s.steppedM}`);
  assert.ok(vioSinceCaptureM(s) <= 0.61, `since capture ${vioSinceCaptureM(s)}`);
  assert.ok(vioNetFromStartM(s) <= 0.61, `from start ${vioNetFromStartM(s)}`);
});

test("VIO: net displacement measures a straight walk, banks across a tracking loss, and restarts at a capture", () => {
  let s = setVioTracking(initialVioState, "NORMAL");
  s = addVioPose(s, { x: 0, y: 0, z: 0 });
  s = addVioPose(s, { x: 4, y: 1, z: 0 });
  assert.equal(vioSinceCaptureM(s), 4);
  s = setVioTracking(s, "UNAVAILABLE");
  s = setVioTracking(s, "NORMAL");
  s = addVioPose(s, { x: 100, y: 0, z: 0 }); // world re-originated: no jump
  s = addVioPose(s, { x: 103, y: 0, z: 0 });
  assert.equal(vioSinceCaptureM(s), 7);
  assert.equal(vioNetFromStartM(s), 7);
  s = markVioCapture(s);
  assert.equal(vioSinceCaptureM(s), 0);
  s = addVioPose(s, { x: 105, y: 0, z: 0 });
  assert.equal(vioSinceCaptureM(s), 2);
  assert.equal(vioNetFromStartM(s), 9);
});

test("VIO: a pose leap faster than the plausibility limit is dropped, not counted as travel", () => {
  const timing = (tMs: number) => ({ tMs, maxSpeedMps: 3 });
  let s = setVioTracking(initialVioState, "NORMAL");
  s = addVioPose(s, { x: 0, y: 0, z: 0 }, timing(0));
  s = addVioPose(s, { x: 1, y: 0, z: 0 }, timing(1000)); // 1 m/s: counted
  s = addVioPose(s, { x: 8, y: 0, z: 0 }, timing(1100)); // 70 m/s: dropped
  s = addVioPose(s, { x: 9, y: 0, z: 0 }, timing(2100)); // 1 m/s from the new position: counted
  assert.equal(s.rejectedJumps, 1);
  assert.equal(vioNetFromStartM(s), 2);
  assert.equal(vioSinceCaptureM(s), 2);
  assert.equal(s.horizontalM, 2);
});

test("VIO: bunched pose updates at walking speed are not mistaken for a leap", () => {
  let s = setVioTracking(initialVioState, "NORMAL");
  s = addVioPose(s, { x: 0, y: 0, z: 0 }, { tMs: 0, maxSpeedMps: 3 });
  s = addVioPose(s, { x: 0.05, y: 0, z: 0 }, { tMs: 1, maxSpeedMps: 3 }); // arrived 1 ms later, one frame of walking
  assert.equal(s.rejectedJumps, 0);
});

test("VIO: movement reported while the motion gate is closed is ignored, and counting resumes cleanly", () => {
  const t = (tMs: number, moving: boolean) => ({ tMs, maxSpeedMps: 100, moving });
  let s = setVioTracking(initialVioState, "NORMAL");
  s = addVioPose(s, { x: 0, y: 0, z: 0 }, t(0, true));
  s = addVioPose(s, { x: 2, y: 0, z: 0 }, t(1000, true)); // walking: counted
  for (let i = 1; i <= 20; i++) s = addVioPose(s, { x: 2 + i, y: 0, z: 0 }, t(1000 + i * 100, false)); // standing, AR drifting 20 m
  s = addVioPose(s, { x: 23, y: 0, z: 0 }, t(4000, true)); // walking again: 1 m
  assert.equal(s.gatedUpdates, 20);
  assert.equal(vioNetFromStartM(s), 3);
  assert.equal(vioSinceCaptureM(s), 3);
  assert.equal(s.horizontalM, 3);
});

test("trigger fires at the configured interval, not before", () => {
  assert.equal(shouldCapture(6.9, 0, 7), false);
  assert.equal(shouldCapture(7, 0, 7), true);
  assert.equal(shouldCapture(20, 14, 7), false);
  assert.throws(() => shouldCapture(1, 0, 0), RangeError);
});

test("percentError is signed", () => {
  assert.equal(percentError(55, 50), 10);
  assert.equal(percentError(45, 50), -10);
});
