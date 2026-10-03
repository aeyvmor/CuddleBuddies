import { test } from "node:test";
import assert from "node:assert/strict";
import {
  addGpsFix,
  addVioPose,
  haversineM,
  initialGpsState,
  initialVioState,
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
