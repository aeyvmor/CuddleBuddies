import { test } from "node:test";
import assert from "node:assert/strict";
import { buildCaptureRequest } from "./capture.ts";
import { addEntry, FAILURE_TEXT, latestCaptured, latestFailure, pendingUploads, queueCounts, type CapturedEntry, type FailedEntry, type QueueEntry } from "./queue.ts";
import { emptyPersisted, parse, PERSIST_VERSION, serialize } from "./persist.ts";
import { samplingMethodFor, SOURCE_ORDER, SOURCES } from "./sources.ts";

const at = new Date("2026-10-04T01:02:03.000Z");

function captured(session: string, seq: number): CapturedEntry {
  const built = buildCaptureRequest({ sequenceNumber: seq, capturedAt: at, fix: { latitude: 14.6, longitude: 121, accuracyM: 6 }, samplingMethod: "GPS_DISTANCE", distanceFromPreviousM: 7 });
  assert.ok(built.ok);
  return { kind: "CAPTURED", clientSessionId: session, request: built.request, image: { uri: `file:///c/${seq}.jpg`, width: 4080, height: 3060, source: "CAMERA" }, upload: { state: "PENDING" } };
}

const failed = (session: string): FailedEntry => ({
  kind: "FAILED",
  clientSessionId: session,
  attemptedAt: at.toISOString(),
  samplingMethod: "GPS_DISTANCE",
  reason: "NO_LOCATION_FIX",
  detail: null,
});

test("counts captures, failures and uploads waiting, per session", () => {
  let q: QueueEntry[] = [];
  q = addEntry(q, captured("s1", 0));
  q = addEntry(q, failed("s1"));
  q = addEntry(q, captured("s1", 1));
  q = addEntry(q, captured("s2", 0));
  assert.deepEqual(queueCounts(q, "s1"), { captured: 2, failed: 1, waitingUpload: 2, uploaded: 0 });
  assert.deepEqual(queueCounts(q), { captured: 3, failed: 1, waitingUpload: 3, uploaded: 0 });
});

test("a failure stays a failure and is never offered for upload", () => {
  const q = [failed("s1"), captured("s1", 0)];
  assert.equal(latestFailure(q, "s1")?.reason, "NO_LOCATION_FIX");
  assert.deepEqual(pendingUploads(q).map((e) => e.request.sequenceNumber), [0]);
  assert.ok(pendingUploads(q).every((e) => e.kind === "CAPTURED"));
});

test("latest capture is the newest captured entry for the session", () => {
  const q = [captured("s1", 0), captured("s1", 1), failed("s1"), captured("s2", 0)];
  assert.equal(latestCaptured(q, "s1")?.request.sequenceNumber, 1);
  assert.equal(latestCaptured([failed("s1")], "s1"), null);
});

test("adding an entry does not mutate the old queue", () => {
  const q: QueueEntry[] = [];
  const q2 = addEntry(q, failed("s1"));
  assert.equal(q.length, 0);
  assert.equal(q2.length, 1);
});

test("every failure reason has words", () => {
  for (const r of ["NO_LOCATION_FIX", "IMAGE_FAILED", "IMAGE_NOT_SAVED", "LOW_STORAGE"] as const) assert.ok(FAILURE_TEXT[r].length > 0);
});

test("saved state round-trips", () => {
  const s = { ...emptyPersisted(at), recentVehicleLabels: ["Jeep 1"], lastDistanceM: 12.5 };
  const r = parse(serialize(s));
  assert.ok(r.ok);
  assert.deepEqual(r.state, s);
});

test("unreadable saved state is reported, not replaced", () => {
  assert.deepEqual(parse("{"), { ok: false, error: "not valid JSON" });
  assert.equal(parse(JSON.stringify({ version: "old" })).ok, false);
  const badSession = { ...emptyPersisted(at), session: { phase: "ACTIVE" } };
  assert.deepEqual(parse(JSON.stringify(badSession)), { ok: false, error: "session record" });
  assert.equal(PERSIST_VERSION, "astig-mobile-state.v2");
});

test("each source records its own samplingMethod; GPS is never VIO", () => {
  assert.equal(samplingMethodFor("GPS_SPEED", "DISTANCE"), "GPS_DISTANCE");
  assert.equal(samplingMethodFor("AR_VIO", "DISTANCE"), "VIO_DISTANCE");
  assert.throws(() => samplingMethodFor("MANUAL_ONLY", "DISTANCE"));
  for (const s of SOURCE_ORDER) assert.equal(samplingMethodFor(s, "TAP"), "MANUAL");
  assert.ok(!/vio|ar\b/i.test(SOURCES.GPS_SPEED.title + SOURCES.GPS_SPEED.activeLabel));
});

test("source copy makes no accuracy claim", () => {
  for (const s of SOURCE_ORDER) {
    const text = Object.values(SOURCES[s]).join(" ");
    assert.ok(!/±|accura|precise|centimet|\d+(\.\d+)?\s?m\b/i.test(text), `${s}: ${text}`);
  }
  assert.equal(SOURCES.AR_VIO.experimental, true);
});
