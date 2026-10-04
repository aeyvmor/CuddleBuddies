import { test } from "node:test";
import assert from "node:assert/strict";
import { AstigClient } from "./api/client.ts";
import { AstigApiError } from "./api/errors.ts";
import { buildCaptureRequest } from "./capture.ts";
import { encodeEntry, parseJournal } from "./journal.ts";
import type { UploadSessionInfo } from "./persist.ts";
import { queueCounts, type CapturedEntry, type QueueEntry } from "./queue.ts";
import { localOnlyCount, runUploadPass, uploadablePending, type UploadClient, type UploadDeps } from "./upload.ts";
import { newId } from "./ids.ts";

const SESSION = "6f1c2b9e-1d1a-4f53-9a77-0c2c5b8a9e10";
const OLD_SESSION = "11111111-2222-4333-8444-555555555555";
const at = new Date("2026-10-04T01:02:03.000Z");

function captured(session: string, seq: number): CapturedEntry {
  const built = buildCaptureRequest({ sequenceNumber: seq, capturedAt: at, fix: { latitude: 14.6, longitude: 121 + seq / 1000, accuracyM: 6 }, samplingMethod: "MANUAL", distanceFromPreviousM: null });
  assert.ok(built.ok);
  return { kind: "CAPTURED", clientSessionId: session, request: built.request, image: { uri: `file:///c/${seq}.jpg`, width: 3060, height: 4080, source: "CAMERA" }, upload: { state: "PENDING" } };
}

const info = (over: Partial<UploadSessionInfo> = {}): UploadSessionInfo => ({
  startedAt: "2026-10-04T01:00:00.000Z",
  startLocation: { latitude: 14.5, longitude: 121 },
  endedAt: null,
  serverId: null,
  endReported: false,
  ...over,
});

interface Call {
  op: string;
  arg: unknown;
}

/** Fake API. `script` can make a call fail: return an error to throw it. */
function fakeClient(script: (op: string, arg: any, n: number) => AstigApiError | void = () => {}) {
  const calls: Call[] = [];
  let urls = 0;
  const step = (op: string, arg: unknown) => {
    calls.push({ op, arg });
    const err = script(op, arg, calls.filter((c) => c.op === op).length);
    if (err) throw err;
  };
  const client: UploadClient = {
    async startSession(body) {
      step("startSession", body);
      return { created: true, session: { id: body.clientSessionId, status: "ACTIVE", startedAt: body.startedAt, endedAt: null } };
    },
    async endSession(id, body) {
      step("endSession", { id, ...body });
      return { session: { id, status: "ENDED", startedAt: "", endedAt: body.endedAt } };
    },
    async registerObservation(sessionId, body) {
      step("registerObservation", { sessionId, clientObservationId: body.clientObservationId });
      return { created: true, observation: { id: `obs-${body.sequenceNumber}`, sessionId, clientObservationId: body.clientObservationId, processingStatus: "PENDING", isSynthetic: false, createdAt: "" } };
    },
    async createUploadUrl(body) {
      step("createUploadUrl", body);
      urls += 1;
      return { method: "PUT", url: `https://bucket.test/${body.observationId}?v=${urls}`, headers: { "content-type": "image/jpeg", "content-length": String(body.contentLengthBytes) }, expiresAt: "" };
    },
    async uploadImage(upload, data) {
      step("uploadImage", { url: upload.url, bytes: (data as Uint8Array).length });
    },
  };
  return { client, calls };
}

function deps(client: UploadClient, disposed: string[] = []): UploadDeps {
  return {
    client,
    deviceId: "dev-team",
    vehicleId: "veh-team",
    prepareImage: async (e) => ({ body: new Uint8Array(1234), bytes: 1234, dispose: () => disposed.push(e.image.uri) }),
  };
}

function run(queue: QueueEntry[], sessions: Record<string, UploadSessionInfo>, d: UploadDeps) {
  const uploaded: string[] = [];
  const sessionUpdates: Record<string, UploadSessionInfo> = {};
  const p = runUploadPass(queue, sessions, d, {
    onUploaded: (e, obs) => uploaded.push(`${e.request.sequenceNumber}:${obs}`),
    onSession: (id, i) => (sessionUpdates[id] = i),
    now: () => at,
  });
  return p.then((result) => ({ result, uploaded, sessionUpdates }));
}

test("uploads oldest first: registers the session once with the team ids, then observation, URL and PUT", async () => {
  const { client, calls } = fakeClient();
  const disposed: string[] = [];
  const q = [captured(SESSION, 0), captured(SESSION, 1)];
  const { result, uploaded, sessionUpdates } = await run(q, { [SESSION]: info() }, deps(client, disposed));
  assert.deepEqual(result, { uploaded: 2, failed: 0, error: null, stopped: false, authLost: false });
  assert.deepEqual(uploaded, ["0:obs-0", "1:obs-1"]);
  assert.deepEqual(
    calls.map((c) => c.op),
    ["startSession", "registerObservation", "createUploadUrl", "uploadImage", "registerObservation", "createUploadUrl", "uploadImage"],
  );
  assert.deepEqual(calls[0]!.arg, { clientSessionId: SESSION, deviceId: "dev-team", vehicleId: "veh-team", startedAt: "2026-10-04T01:00:00.000Z", startLocation: { latitude: 14.5, longitude: 121 } });
  assert.deepEqual(calls[2]!.arg, { observationId: "obs-0", contentType: "image/jpeg", contentLengthBytes: 1234 });
  assert.equal(sessionUpdates[SESSION]!.serverId, SESSION);
  assert.deepEqual(disposed, ["file:///c/0.jpg", "file:///c/1.jpg"]);
});

test("a session without a start fix is registered at its first capture's location, and that location is kept", async () => {
  const { client, calls } = fakeClient();
  const { sessionUpdates } = await run([captured(SESSION, 0)], { [SESSION]: info({ startLocation: null }) }, deps(client));
  assert.deepEqual((calls[0]!.arg as { startLocation: unknown }).startLocation, { latitude: 14.6, longitude: 121 });
  assert.deepEqual(sessionUpdates[SESSION]!.startLocation, { latitude: 14.6, longitude: 121 });
});

test("409 ALREADY_UPLOADED from /upload-url counts as done, without a PUT", async () => {
  const { client, calls } = fakeClient((op) => (op === "createUploadUrl" ? new AstigApiError(409, "ALREADY_UPLOADED", "Already uploaded.", "req-1") : undefined));
  const { result, uploaded } = await run([captured(SESSION, 0)], { [SESSION]: info({ serverId: SESSION }) }, deps(client));
  assert.equal(result.uploaded, 1);
  assert.deepEqual(uploaded, ["0:obs-0"]);
  assert.ok(!calls.some((c) => c.op === "uploadImage"));
});

test("an S3 403 (expired URL) gets one new URL, never the old one again", async () => {
  const { client, calls } = fakeClient((op, _a, n) => (op === "uploadImage" && n === 1 ? new AstigApiError(403, "UNEXPECTED_RESPONSE", "Upload rejected by storage (403).") : undefined));
  const { result } = await run([captured(SESSION, 0)], { [SESSION]: info({ serverId: SESSION }) }, deps(client));
  assert.equal(result.uploaded, 1);
  const puts = calls.filter((c) => c.op === "uploadImage").map((c) => (c.arg as { url: string }).url);
  assert.deepEqual(puts, ["https://bucket.test/obs-0?v=1", "https://bucket.test/obs-0?v=2"]);
});

test("offline stops the pass and leaves everything PENDING", async () => {
  const { client } = fakeClient((op) => (op === "registerObservation" ? new AstigApiError(0, "NETWORK_ERROR", "Network error.") : undefined));
  const q = [captured(SESSION, 0), captured(SESSION, 1)];
  const { result, uploaded } = await run(q, { [SESSION]: info() }, deps(client));
  assert.equal(result.stopped, true);
  assert.equal(result.uploaded, 0);
  assert.deepEqual(uploaded, []);
  assert.equal((result.error as AstigApiError).code, "NETWORK_ERROR");
});

test("a refused capture stays PENDING and does not block the next one", async () => {
  const q = [captured(SESSION, 0), captured(SESSION, 1)];
  const refused = q[0]!.kind === "CAPTURED" ? q[0]!.request.clientObservationId : "";
  const { client } = fakeClient((op, arg) =>
    op === "registerObservation" && (arg as { clientObservationId: string }).clientObservationId === refused
      ? new AstigApiError(400, "VALIDATION_FAILED", "capturedAt is after the session ended.", "req-400")
      : undefined,
  );
  const { result, uploaded } = await run(q, { [SESSION]: info({ serverId: SESSION }) }, deps(client));
  assert.deepEqual(uploaded, ["1:obs-1"]);
  assert.equal(result.failed, 1);
  assert.equal(result.stopped, false);
  assert.equal((result.error as AstigApiError).requestId, "req-400");
});

test("a sign-in problem stops the pass and is reported as auth lost", async () => {
  const { client } = fakeClient((op) => (op === "startSession" ? new AstigApiError(401, "AUTH_REQUIRED", "Please sign in.") : undefined));
  const { result } = await run([captured(SESSION, 0)], { [SESSION]: info() }, deps(client));
  assert.equal(result.authLost, true);
  assert.equal(result.stopped, true);
});

test("captures from sessions before the uploader existed are never uploaded", async () => {
  const { client, calls } = fakeClient();
  const q = [captured(OLD_SESSION, 0), captured(SESSION, 0)];
  const sessions = { [SESSION]: info({ serverId: SESSION }) };
  assert.equal(uploadablePending(q, sessions).length, 1);
  assert.equal(localOnlyCount(q, sessions), 1);
  await run(q, sessions, deps(client));
  assert.ok(calls.every((c) => (c.arg as { sessionId?: string }).sessionId !== OLD_SESSION));
});

test("an ended session is reported once, after its captures", async () => {
  const { client, calls } = fakeClient();
  const ended = info({ serverId: SESSION, endedAt: "2026-10-04T01:30:00.000Z" });
  const first = await run([captured(SESSION, 0)], { [SESSION]: ended }, deps(client));
  assert.deepEqual(calls.at(-1), { op: "endSession", arg: { id: SESSION, status: "ENDED", endedAt: "2026-10-04T01:30:00.000Z" } });
  assert.equal(first.sessionUpdates[SESSION]!.endReported, true);
  const before = calls.length;
  await run([], { [SESSION]: first.sessionUpdates[SESSION]! }, deps(client));
  assert.equal(calls.length, before);
});

test("an upload mark in the journal makes the capture UPLOADED after a restart", () => {
  const e = captured(SESSION, 0);
  const text = encodeEntry(e) + encodeEntry({ kind: "UPLOADED", clientObservationId: e.request.clientObservationId, observationId: "obs-0", uploadedAt: at.toISOString() });
  const r = parseJournal(text);
  assert.equal(r.unreadableLines, 0);
  assert.deepEqual(r.entries[0]!.kind === "CAPTURED" && r.entries[0]!.upload, { state: "UPLOADED", observationId: "obs-0", uploadedAt: at.toISOString() });
  assert.deepEqual(queueCounts(r.entries), { captured: 1, failed: 0, waitingUpload: 0, uploaded: 1 });
});

test("ids come from a CSPRNG and have the version-4 layout", () => {
  const ids = new Set(Array.from({ length: 200 }, newId));
  assert.equal(ids.size, 200);
  for (const id of ids) assert.match(id, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
});

test("the copied AstigClient PUTs with the signed type only and maps a storage 403", async () => {
  const seen: { url: string; headers: Record<string, string> }[] = [];
  let status = 200;
  const fetchImpl = (async (url: string, init: RequestInit) => {
    seen.push({ url, headers: init.headers as Record<string, string> });
    return new Response(null, { status });
  }) as unknown as typeof fetch;
  const c = new AstigClient({ baseUrl: "https://api.test", getToken: async () => "t", fetchImpl });
  const upload = { url: "https://bucket.test/put", headers: { "content-type": "image/jpeg", "content-length": "3" } };
  await c.uploadImage(upload, new Uint8Array(3));
  assert.deepEqual(seen[0]!.headers, { "content-type": "image/jpeg" });
  status = 403;
  await assert.rejects(c.uploadImage(upload, new Uint8Array(3)), (e: unknown) => e instanceof AstigApiError && e.status === 403);
});
