import pg from "pg";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { SEED } from "../../../database/seeds/synthetic-demo";
import { resetAndSeed, testDatabaseUrl } from "../../../database/test/helpers";
import { createApp } from "../src/app";
import type { EvidenceUploadSigner } from "../src/evidence";

const pool = new pg.Pool({ connectionString: testDatabaseUrl(), max: 4 });
const SESSION = "0c0ffee0-0000-4000-8000-000000000001";
const OBS = "0c0ffee0-0000-4000-8000-0000000000a1";
const operator: Record<string, string> = { "x-astig-dev-subject": SEED.operatorSubject, "x-astig-dev-roles": "OPERATOR" };
const otherOperator = { "x-astig-dev-subject": "demo-operator-02", "x-astig-dev-roles": "OPERATOR" };

const signed: { key: string; len: number }[] = [];
const uploadSigner: EvidenceUploadSigner = {
  signUpload: async ({ objectKey, contentLengthBytes }) => {
    signed.push({ key: objectKey, len: contentLengthBytes });
    return { url: "https://bucket.example.test/signed?X-Amz-Signature=x", expiresAt: "2026-10-03T00:05:00.000Z" };
  },
};
const app = createApp({ pool, authMode: "local-dev", evidenceSigner: null, uploadSigner, log: () => undefined });
const noStorage = createApp({ pool, authMode: "local-dev", evidenceSigner: null, uploadSigner: null, log: () => undefined });

const call = async (handler: typeof app, method: string, path: string, body: unknown, headers = operator) => {
  const res = await handler({ method, path, headers, body: JSON.stringify(body), requestId: "t" });
  return { status: res.statusCode, body: JSON.parse(res.body) };
};
const api = (method: string, path: string, body: unknown, headers = operator) => call(app, method, path, body, headers);

const startBody = {
  clientSessionId: SESSION,
  deviceId: SEED.deviceId,
  vehicleId: SEED.vehicleId,
  startedAt: "2026-10-03T01:00:00.000Z",
  startLocation: { latitude: 14.651, longitude: 121.045 },
};
const capture = {
  schemaVersion: "observation-capture.v0",
  clientObservationId: OBS,
  sequenceNumber: 0,
  capturedAt: "2026-10-03T01:05:00.000Z",
  location: { latitude: 14.6527, longitude: 121.0475 },
  horizontalAccuracyM: 5,
  samplingMethod: "GPS_DISTANCE",
  distanceFromPreviousM: null,
};

beforeEach(async () => {
  signed.length = 0;
  const c = await pool.connect();
  try {
    await resetAndSeed(c);
  } finally {
    c.release();
  }
});
afterAll(() => pool.end());

describe("sessions", () => {
  it("starts a session idempotently with a client-generated id", async () => {
    const first = await api("POST", "/sessions", startBody);
    expect(first.status).toBe(201);
    expect(first.body.session).toMatchObject({ id: SESSION, status: "ACTIVE", operatorSubject: SEED.operatorSubject, isSynthetic: true, endedAt: null });
    const replay = await api("POST", "/sessions", startBody);
    expect(replay.status).toBe(200);
    expect(replay.body.created).toBe(false);
    const conflict = await api("POST", "/sessions", { ...startBody, startedAt: "2026-10-03T02:00:00.000Z" });
    expect(conflict.body.error.code).toBe("IDEMPOTENCY_CONFLICT");
  });

  it("rejects unregistered devices, invalid coordinates, and officers", async () => {
    expect((await api("POST", "/sessions", { ...startBody, deviceId: "0c0ffee0-0000-4000-8000-0000000000ff" })).body.error.code).toBe("VALIDATION_FAILED");
    expect((await api("POST", "/sessions", { ...startBody, startLocation: { latitude: 100, longitude: 0 } })).status).toBe(400);
    const officer = { "x-astig-dev-subject": "demo-officer-01", "x-astig-dev-roles": "OFFICER" };
    expect((await api("POST", "/sessions", startBody, officer)).status).toBe(403);
  });

  it("ends a session once; repeating the same end is a no-op", async () => {
    await api("POST", "/sessions", startBody);
    const end = { status: "ENDED", endedAt: "2026-10-03T02:00:00.000Z" };
    expect((await api("PATCH", `/sessions/${SESSION}`, end)).body.session).toMatchObject({ status: "ENDED", endedAt: end.endedAt });
    expect((await api("PATCH", `/sessions/${SESSION}`, end)).status).toBe(200);
    expect((await api("PATCH", `/sessions/${SESSION}`, { ...end, endedAt: "2026-10-03T03:00:00.000Z" })).body.error.code).toBe("INVALID_TRANSITION");
    expect((await api("PATCH", `/sessions/${SESSION}`, end, otherOperator)).status).toBe(403);
  });
});

describe("observations + upload URL", () => {
  it("registers capture metadata idempotently without exposing the object key", async () => {
    await api("POST", "/sessions", startBody);
    const first = await api("POST", `/sessions/${SESSION}/observations`, capture);
    expect(first.status).toBe(201);
    expect(first.body.observation).toMatchObject({ clientObservationId: OBS, processingStatus: "PENDING" });
    expect(JSON.stringify(first.body)).not.toContain("sessions/");
    const replay = await api("POST", `/sessions/${SESSION}/observations`, capture);
    expect(replay.status).toBe(200);
    expect(replay.body.observation.id).toBe(first.body.observation.id);
    expect((await api("POST", `/sessions/${SESSION}/observations`, { ...capture, location: { latitude: 91, longitude: 0 } })).status).toBe(400);
  });

  it("issues a presigned PUT for the server-derived key, only to the session operator, only until uploaded", async () => {
    await api("POST", "/sessions", startBody);
    const obs = (await api("POST", `/sessions/${SESSION}/observations`, capture)).body.observation;
    const req = { observationId: obs.id, contentType: "image/jpeg", contentLengthBytes: 2048 };

    const ok = await api("POST", "/upload-url", req);
    expect(ok.status).toBe(200);
    expect(ok.body).toMatchObject({ method: "PUT", headers: { "content-type": "image/jpeg", "content-length": "2048" } });
    expect(signed).toEqual([{ key: `sessions/${SESSION}/observations/${OBS}.jpg`, len: 2048 }]);

    expect((await api("POST", "/upload-url", req, otherOperator)).status).toBe(403);
    expect((await api("POST", "/upload-url", { ...req, contentType: "image/png" })).status).toBe(400);
    expect((await api("POST", "/upload-url", { ...req, contentLengthBytes: 50 * 1024 * 1024 })).status).toBe(400);

    await pool.query("UPDATE observations SET image_uploaded_at = now() WHERE id = $1", [obs.id]);
    expect((await api("POST", "/upload-url", req)).body.error.code).toBe("ALREADY_UPLOADED");
  });

  it("reports SERVICE_UNAVAILABLE when no evidence bucket is configured", async () => {
    await api("POST", "/sessions", startBody);
    const obs = (await api("POST", `/sessions/${SESSION}/observations`, capture)).body.observation;
    const r = await call(noStorage, "POST", "/upload-url", { observationId: obs.id, contentType: "image/jpeg", contentLengthBytes: 10 });
    expect(r.status).toBe(503);
    expect(r.body.error.code).toBe("SERVICE_UNAVAILABLE");
  });
});
