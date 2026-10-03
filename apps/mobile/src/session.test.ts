import { test } from "node:test";
import assert from "node:assert/strict";
import {
  beginStop,
  consumeSequence,
  DEFAULT_INTERVAL_M,
  elapsedMs,
  finishStop,
  formatDistance,
  formatElapsed,
  gapMs,
  IDLE,
  markBackground,
  markForeground,
  rememberLabel,
  resetToIdle,
  resumeAfterRestart,
  setStartLocation,
  startSession,
  stepInterval,
  validateSetup,
  type SessionConfig,
  type SessionState,
} from "./session.ts";

const config: SessionConfig = { deviceLabel: "Phone A", vehicleLabel: "Jeepney 12", intervalM: 7, source: "GPS_SPEED" };
const t0 = new Date("2026-10-04T01:00:00.000Z");
const at = (s: number) => new Date(t0.getTime() + s * 1000);
const active = (): SessionState => startSession(IDLE, config, t0, () => 0.5);

test("lifecycle runs IDLE -> ACTIVE -> STOPPING -> ENDED -> IDLE", () => {
  const a = active();
  assert.equal(a.phase, "ACTIVE");
  assert.ok(a.phase === "ACTIVE" && /^[0-9a-f-]{36}$/.test(a.session.clientSessionId));
  const s = beginStop(a);
  assert.equal(s.phase, "STOPPING");
  const e = finishStop(s, at(90));
  assert.equal(e.phase, "ENDED");
  assert.ok(e.phase === "ENDED" && e.session.endedAt === at(90).toISOString());
  assert.equal(resetToIdle(e).phase, "IDLE");
});

test("illegal transitions throw instead of silently changing state", () => {
  assert.throws(() => beginStop(IDLE), /cannot stop in phase IDLE/);
  assert.throws(() => startSession(active(), config, t0), /cannot start in phase ACTIVE/);
  assert.throws(() => finishStop(active(), t0), /cannot finish stopping in phase ACTIVE/);
  assert.throws(() => resetToIdle(active()), /cannot reset in phase ACTIVE/);
});

test("elapsed time freezes at the end of the session", () => {
  const e = finishStop(beginStop(active()), at(125));
  assert.ok(e.phase === "ENDED");
  assert.equal(elapsedMs(e.session, at(9999)), 125_000);
  assert.equal(formatElapsed(3_723_000), "01:02:03");
});

test("backgrounding records a gap that closes on return, and is not opened twice", () => {
  let s = markBackground(active(), at(10));
  s = markBackground(s, at(12));
  s = markForeground(s, at(40));
  assert.ok(s.phase === "ACTIVE");
  assert.deepEqual(s.session.gaps, [{ reason: "BACKGROUND", from: at(10).toISOString(), to: at(40).toISOString() }]);
  assert.equal(gapMs(s.session, at(50)), 30_000);
});

test("a restart records the time the app was not running and carries the shown distance", () => {
  const s = resumeAfterRestart(markBackground(active(), at(10)), at(20), 312.4, at(80));
  assert.ok(s.phase === "ACTIVE");
  assert.deepEqual(
    s.session.gaps.map((g) => [g.reason, g.from, g.to]),
    [
      ["BACKGROUND", at(10).toISOString(), at(20).toISOString()],
      ["APP_NOT_RUNNING", at(20).toISOString(), at(80).toISOString()],
    ],
  );
  assert.equal(s.session.distanceCarriedM, 312.4);
});

test("stopping closes any open gap", () => {
  const e = finishStop(beginStop(markBackground(active(), at(10))), at(30));
  assert.ok(e.phase === "ENDED");
  assert.equal(e.session.gaps[0]!.to, at(30).toISOString());
});

test("the first fix becomes the start location and is not overwritten", () => {
  let s = setStartLocation(active(), { latitude: 14.6, longitude: 121 });
  s = setStartLocation(s, { latitude: 1, longitude: 1 });
  assert.ok(s.phase === "ACTIVE");
  assert.deepEqual(s.session.startLocation, { latitude: 14.6, longitude: 121 });
});

test("sequence numbers only advance", () => {
  let s = consumeSequence(active(), 0);
  s = consumeSequence(s, 4);
  s = consumeSequence(s, 2);
  assert.ok(s.phase === "ACTIVE");
  assert.equal(s.session.nextSequence, 5);
});

test("distance formatting switches to km at 1000 m", () => {
  assert.deepEqual(formatDistance(640.9), { value: "640", unit: "m" });
  assert.deepEqual(formatDistance(1250), { value: "1.25", unit: "km" });
  assert.deepEqual(formatDistance(12_340), { value: "12.3", unit: "km" });
});

test("setup validation accepts good input and trims labels", () => {
  const r = validateSetup({ deviceLabel: "  Phone A ", vehicleLabel: "Jeepney 12", intervalM: "7", source: "AR_VIO" });
  assert.deepEqual(r, { ok: true, config: { deviceLabel: "Phone A", vehicleLabel: "Jeepney 12", intervalM: 7, source: "AR_VIO" } });
  const comma = validateSetup({ deviceLabel: "a", vehicleLabel: "b", intervalM: "7,5", source: "GPS_SPEED" });
  assert.ok(comma.ok && comma.config.intervalM === 7.5);
});

test("setup validation explains every problem at once", () => {
  const r = validateSetup({ deviceLabel: " ", vehicleLabel: "x".repeat(61), intervalM: "0", source: null });
  assert.ok(!r.ok);
  assert.deepEqual(Object.keys(r.errors).sort(), ["deviceLabel", "intervalM", "source", "vehicleLabel"]);
  assert.match(r.errors.intervalM!, /2 to 50 metres/);
});

test("interval is rejected outside 2-50 m or when not a plain number", () => {
  for (const bad of ["1.9", "51", "abc", "7m", "-7", "", "1e1"]) {
    const r = validateSetup({ deviceLabel: "a", vehicleLabel: "b", intervalM: bad, source: "GPS_SPEED" });
    assert.ok(!r.ok && r.errors.intervalM, `should reject "${bad}"`);
  }
});

test("manual-only does not need an interval", () => {
  const r = validateSetup({ deviceLabel: "a", vehicleLabel: "b", intervalM: "", source: "MANUAL_ONLY" });
  assert.ok(r.ok && r.config.intervalM === DEFAULT_INTERVAL_M);
});

test("control characters in labels are refused", () => {
  const r = validateSetup({ deviceLabel: "a\u0007", vehicleLabel: "b", intervalM: "7", source: "GPS_SPEED" });
  assert.ok(!r.ok && r.errors.deviceLabel);
});

test("interval stepper clamps to the allowed range", () => {
  assert.equal(stepInterval("7", 1), "8");
  assert.equal(stepInterval("50", 1), "50");
  assert.equal(stepInterval("2", -1), "2");
  assert.equal(stepInterval("junk", 1), "8");
});

test("recent labels keep the newest first without case duplicates", () => {
  assert.deepEqual(rememberLabel(["Jeep 1", "Jeep 2"], "jeep 2"), ["jeep 2", "Jeep 1"]);
  assert.deepEqual(rememberLabel(["a", "b", "c", "d", "e"], "f"), ["f", "a", "b", "c", "d"]);
  assert.deepEqual(rememberLabel(["a"], "  "), ["a"]);
});
