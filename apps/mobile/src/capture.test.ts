import { test } from "node:test";
import assert from "node:assert/strict";
import { buildCaptureRequest, CAPTURE_SCHEMA_VERSION, uuidV4 } from "./capture.ts";

const fix = { latitude: 14.6, longitude: 121, accuracyM: 7.6049 };
const at = new Date("2026-10-04T01:02:03.000Z");

test("uuidV4 has the version-4 layout", () => {
  for (let i = 0; i < 50; i++) assert.match(uuidV4(), /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
});

test("a distance-triggered capture carries the contract fields, UTC time and rounded metres", () => {
  const built = buildCaptureRequest({ sequenceNumber: 3, capturedAt: at, fix, samplingMethod: "VIO_DISTANCE", distanceFromPreviousM: 7.126 });
  assert.ok(built.ok);
  assert.deepEqual(
    { ...built.request, clientObservationId: "x" },
    {
      schemaVersion: CAPTURE_SCHEMA_VERSION,
      clientObservationId: "x",
      sequenceNumber: 3,
      capturedAt: "2026-10-04T01:02:03.000Z",
      location: { latitude: 14.6, longitude: 121 },
      horizontalAccuracyM: 7.6,
      samplingMethod: "VIO_DISTANCE",
      distanceFromPreviousM: 7.13,
    },
  );
});

test("a MANUAL capture makes no distance claim", () => {
  const built = buildCaptureRequest({ sequenceNumber: 0, capturedAt: at, fix, samplingMethod: "MANUAL", distanceFromPreviousM: 4 });
  assert.ok(built.ok);
  assert.equal(built.request.distanceFromPreviousM, null);
});

test("unreported accuracy stays null rather than becoming zero", () => {
  const built = buildCaptureRequest({ sequenceNumber: 0, capturedAt: at, fix: { ...fix, accuracyM: null }, samplingMethod: "GPS_DISTANCE", distanceFromPreviousM: 7 });
  assert.ok(built.ok);
  assert.equal(built.request.horizontalAccuracyM, null);
});

test("no location fix is a refused capture, never invented coordinates", () => {
  const built = buildCaptureRequest({ sequenceNumber: 0, capturedAt: at, fix: null, samplingMethod: "GPS_DISTANCE", distanceFromPreviousM: 7 });
  assert.deepEqual(built, { ok: false, reason: "NO_LOCATION_FIX" });
});
