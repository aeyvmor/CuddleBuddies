import { test } from "node:test";
import assert from "node:assert/strict";
import { buildCaptureRequest } from "./capture.ts";
import { encodeEntries, encodeEntry, parseJournal, reconcileSequence } from "./journal.ts";
import { emptyPersisted, LEGACY_PERSIST_VERSION, parse, PERSIST_VERSION, serialize } from "./persist.ts";
import type { CapturedEntry, FailedEntry, QueueEntry } from "./queue.ts";
import { IDLE, startSession } from "./session.ts";
import { formatBytes, formatCount, MIN_FREE_BYTES, photosRemaining, photoStats, storageLevel } from "./storageGuard.ts";

const at = new Date("2026-10-04T01:02:03.000Z");
const MB = 1024 * 1024;

function captured(session: string, seq: number, bytes?: number): CapturedEntry {
  const built = buildCaptureRequest({ sequenceNumber: seq, capturedAt: at, fix: { latitude: 14.6, longitude: 121, accuracyM: 6 }, samplingMethod: "GPS_DISTANCE", distanceFromPreviousM: 7 });
  assert.ok(built.ok);
  return {
    kind: "CAPTURED",
    clientSessionId: session,
    request: built.request,
    image: { uri: `file:///c/${seq}.jpg`, width: 4080, height: 3060, source: "CAMERA", ...(bytes === undefined ? {} : { bytes }) },
    upload: { state: "PENDING" },
  };
}
const failed = (session: string): FailedEntry => ({ kind: "FAILED", clientSessionId: session, attemptedAt: at.toISOString(), samplingMethod: "GPS_DISTANCE", reason: "LOW_STORAGE", detail: null });

test("journal round-trips one record per line", () => {
  const entries: QueueEntry[] = [captured("s1", 0, 2 * MB), failed("s1"), captured("s1", 1)];
  const text = encodeEntries(entries);
  assert.equal(text.split("\n").length, 4); // three lines plus the final newline
  const r = parseJournal(text);
  assert.deepEqual(r, { entries, unreadableLines: 0, endsCleanly: true });
  assert.deepEqual(parseJournal(""), { entries: [], unreadableLines: 0, endsCleanly: true });
});

test("a line torn by a crash is counted, not guessed, and the file is flagged for repair", () => {
  const good = encodeEntry(captured("s1", 0));
  const torn = encodeEntry(captured("s1", 1)).slice(0, 60);
  const r = parseJournal(good + torn);
  assert.equal(r.entries.length, 1);
  assert.equal(r.unreadableLines, 1);
  assert.equal(r.endsCleanly, false);
  // A valid JSON line of the wrong shape is unreadable too.
  assert.equal(parseJournal('{"kind":"CAPTURED"}\n').unreadableLines, 1);
});

test("each record is exactly one line, and a long route parses quickly at launch", () => {
  const e = captured("s1", 4999, 2 * MB);
  const line = encodeEntry(e);
  assert.equal(line.indexOf("\n"), line.length - 1);
  const text = encodeEntries(Array.from({ length: 5000 }, (_, i) => captured("s1", i, 2 * MB)));
  const t0 = performance.now();
  const r = parseJournal(text);
  const ms = performance.now() - t0;
  assert.equal(r.entries.length, 5000);
  assert.ok(ms < 1000, `parsed 5000 records in ${ms.toFixed(0)} ms`);
});

test("the next sequence number never reuses one already in the journal", () => {
  const s = startSession(IDLE, { deviceLabel: "a", vehicleLabel: "b", intervalM: 7, source: "GPS_SPEED" }, at, () => 0.5);
  assert.ok(s.phase === "ACTIVE");
  const id = s.session.clientSessionId;
  const r = reconcileSequence(s, [captured(id, 0), captured(id, 7), captured("other", 99), failed(id)]);
  assert.ok(r.phase === "ACTIVE" && r.session.nextSequence === 8);
  assert.equal(reconcileSequence(s, []), s);
  assert.equal(reconcileSequence(IDLE, [captured(id, 3)]), IDLE);
});

test("the state file holds no capture records", () => {
  const text = serialize({ ...emptyPersisted(at), queue: [captured("s1", 0)] });
  assert.ok(!text.includes("clientObservationId"));
  const r = parse(text);
  assert.ok(r.ok && r.legacyQueue === null && r.state.version === PERSIST_VERSION);
});

test("a v1 state file is read with its records, for migration into the journal", () => {
  const v1 = { ...emptyPersisted(at), version: LEGACY_PERSIST_VERSION, queue: [captured("s1", 0), failed("s1")] };
  const r = parse(JSON.stringify(v1));
  assert.ok(r.ok);
  assert.equal(r.state.version, PERSIST_VERSION);
  assert.equal(r.legacyQueue?.length, 2);
  assert.equal(parse(JSON.stringify({ ...v1, queue: [{ kind: "CAPTURED" }] })).ok, false);
});

test("storage level: refuse below 500 MB, warn below 2 GB, unknown stays unknown", () => {
  assert.equal(storageLevel(MIN_FREE_BYTES - 1), "FULL");
  assert.equal(storageLevel(1024 * MB), "LOW");
  assert.equal(storageLevel(86 * 1024 * MB), "OK");
  assert.equal(storageLevel(null), null);
  assert.equal(storageLevel(Number.NaN), null);
});

test("photo stats ignore unknown sizes and other sessions", () => {
  const q = [captured("s1", 0, 2 * MB), captured("s1", 1), captured("s1", 2, 4 * MB), captured("s2", 0, 9 * MB), failed("s1")];
  assert.deepEqual(photoStats(q, "s1"), { count: 3, bytes: 6 * MB, averageBytes: 3 * MB });
  assert.equal(photoStats([captured("s1", 0)], "s1").averageBytes, null);
});

test("photos remaining keeps the reserve and needs a known average", () => {
  assert.equal(photosRemaining(MIN_FREE_BYTES + 30 * MB, 3 * MB), 10);
  assert.equal(photosRemaining(MIN_FREE_BYTES - MB, 3 * MB), 0);
  assert.equal(photosRemaining(null, 3 * MB), null);
  assert.equal(photosRemaining(10 * 1024 * MB, null), null);
});

test("byte and count formatting", () => {
  assert.equal(formatBytes(86 * 1024 * MB), "86 GB");
  assert.equal(formatBytes(1.44 * 1024 * MB), "1.4 GB");
  assert.equal(formatBytes(312 * MB), "312 MB");
  assert.equal(formatCount(29_640), "30,000");
  assert.equal(formatCount(1_234), "1,200");
  assert.equal(formatCount(87), "87");
});
