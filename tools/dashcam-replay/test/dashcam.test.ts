import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { ObservationCaptureRequest } from "@astig/contracts";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ffmpegArgs, extractFrames } from "../src/extract";
import { cumulativeDistances, haversineM, type LonLat } from "../src/geo";
import { uuidv5 } from "../src/ids";
import { buildPlan, frameFileName, RouteFile, type ReplayPlan } from "../src/plan";
import { replay } from "../src/replay";

// ~700 m north–south line along a Manila street grid; 0.001° latitude ≈ 111 m.
const route: RouteFile = {
  name: "test-route",
  video: "video.mp4",
  recordedStartUtc: "2026-10-01T01:00:00.000Z",
  locationAccuracyM: 15,
  route: [[120.9900, 14.6000], [120.9900, 14.6030], [120.9900, 14.6063]],
  anchors: [{ videoSec: 10, routeIndex: 0 }, { videoSec: 40, routeIndex: 1 }, { videoSec: 100, routeIndex: 2 }],
};
const opts = { videoFile: "C:/videos/video.mp4", videoSha256: "a".repeat(64), intervalM: 7 };

describe("geo", () => {
  it("measures ~111 m per 0.001° latitude", () => {
    expect(haversineM([121, 14.6], [121, 14.601])).toBeCloseTo(111.2, 0);
    expect(cumulativeDistances(route.route as LonLat[])[2]).toBeCloseTo(700.6, 0);
  });
});

describe("uuidv5", () => {
  it("matches the RFC 9562 test vector and is deterministic", () => {
    expect(uuidv5("www.example.com", "6ba7b810-9dad-11d1-80b4-00c04fd430c8")).toBe("2ed6657d-e927-568b-95e1-2665a8aea6a2");
  });
});

describe("buildPlan (distance-based sampling)", () => {
  const plan = buildPlan(RouteFile.parse(route), opts);

  it("emits a frame every 7 m along the traced route", () => {
    expect(plan.frames.length).toBe(Math.floor(700.6 / 7) + 1);
    for (let i = 1; i < plan.frames.length; i++) {
      const a = plan.frames[i - 1]!;
      const b = plan.frames[i]!;
      expect(b.distanceAlongRouteM - a.distanceAlongRouteM).toBeCloseTo(7, 5);
      expect(haversineM([a.longitude, a.latitude], [b.longitude, b.latitude])).toBeCloseTo(7, 0);
    }
  });

  it("interpolates video time between anchors (different speeds per segment)", () => {
    expect(plan.frames[0]!.videoSec).toBe(10);
    // first segment: 333.6 m in 30 s; second: 367 m in 60 s
    const atAnchor = plan.frames.find((f) => f.distanceAlongRouteM >= 333.6)!;
    expect(atAnchor.videoSec).toBeGreaterThan(40);
    expect(atAnchor.videoSec).toBeLessThan(41.5);
    expect(plan.frames.at(-1)!.videoSec).toBeLessThanOrEqual(100);
    expect(plan.frames.every((f, i) => i === 0 || f.videoSec > plan.frames[i - 1]!.videoSec)).toBe(true);
  });

  it("derives UTC capture times from the stated recording start", () => {
    expect(plan.frames[0]!.capturedAt).toBe("2026-10-01T01:00:10.000Z");
    expect(plan.recordedStartUtc).toBe("2026-10-01T01:00:10.000Z");
  });

  it("produces deterministic session and observation ids (safe re-runs)", () => {
    const again = buildPlan(RouteFile.parse(route), opts);
    expect(again.sessionId).toBe(plan.sessionId);
    expect(again.frames.map((f) => f.clientObservationId)).toEqual(plan.frames.map((f) => f.clientObservationId));
    const other = buildPlan(RouteFile.parse({ ...route, anchors: [{ videoSec: 11, routeIndex: 0 }, ...route.anchors.slice(1)] }), opts);
    expect(other.sessionId).not.toBe(plan.sessionId);
  });

  it("produces capture metadata that passes the shared contract", () => {
    const f = plan.frames[3]!;
    const r = ObservationCaptureRequest.safeParse({
      schemaVersion: "observation-capture.v0", clientObservationId: f.clientObservationId, sequenceNumber: f.index,
      capturedAt: f.capturedAt, location: { latitude: f.latitude, longitude: f.longitude },
      horizontalAccuracyM: 15, samplingMethod: "DASHCAM_REPLAY", distanceFromPreviousM: 7,
    });
    expect(r.success).toBe(true);
  });

  it("warns on implausible speeds and rejects bad routes", () => {
    const fast = buildPlan(RouteFile.parse({ ...route, anchors: [{ videoSec: 0, routeIndex: 0 }, { videoSec: 5, routeIndex: 2 }] }), opts);
    expect(fast.warnings[0]).toMatch(/km\/h/);
    expect(RouteFile.safeParse({ ...route, anchors: [{ videoSec: 5, routeIndex: 1 }, { videoSec: 1, routeIndex: 2 }] }).success).toBe(false);
    expect(RouteFile.safeParse({ ...route, anchors: [{ videoSec: 1, routeIndex: 0 }, { videoSec: 2, routeIndex: 9 }] }).success).toBe(false);
    expect(RouteFile.safeParse({ ...route, route: [[200, 14]] }).success).toBe(false);
    expect(() => buildPlan(RouteFile.parse(route), { ...opts, intervalM: 0 })).toThrow();
  });
});

describe("extract", () => {
  it("builds shell-free ffmpeg args that strip metadata", () => {
    const args = ffmpegArgs("C:/v/a b.mp4", 12.3456, "C:/w/000001.jpg");
    expect(args).toEqual(expect.arrayContaining(["-ss", "12.346", "-i", "C:/v/a b.mp4", "-frames:v", "1", "-map_metadata", "-1", "-y", "C:/w/000001.jpg"]));
  });

  it("runs one extraction per planned frame", async () => {
    const plan = buildPlan(RouteFile.parse(route), opts);
    const calls: string[][] = [];
    const dir = await mkdtemp(path.join(tmpdir(), "astig-extract-"));
    try {
      const n = await extractFrames(plan, dir, { runner: async (_c, a) => void calls.push(a), ffmpeg: "ffmpeg" });
      expect(n).toBe(plan.frames.length);
      expect(calls.at(-1)!.at(-1)).toBe(path.join(dir, "frames", frameFileName(plan.frames.length)));
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

describe("replay (against a fake API)", () => {
  let dir: string;
  let plan: ReplayPlan;
  beforeAll(async () => {
    plan = buildPlan(RouteFile.parse(route), opts);
    dir = await mkdtemp(path.join(tmpdir(), "astig-replay-"));
    // Curated subset: only frames 1, 2, and 5 survived redaction review.
    for (const i of [1, 2, 5]) await writeFile(path.join(dir, frameFileName(i)), Buffer.from([0xff, 0xd8, 0xff, 0xd9]));
  });
  afterAll(() => rm(dir, { recursive: true, force: true }));

  function fakeApi() {
    const observations = new Map<string, { id: string; body: string; uploaded: boolean }>();
    const sessions = new Map<string, string | null>();
    const calls: string[] = [];
    let flaky = 1; // first upload-url call returns 503 once
    const impl = (async (url: string, init: RequestInit) => {
      const u = new URL(url);
      const method = init.method ?? "GET";
      calls.push(`${method} ${u.pathname}`);
      const body = init.body && typeof init.body === "string" ? JSON.parse(init.body) : null;
      const json = (status: number, b: unknown) => new Response(JSON.stringify(b), { status });
      if (u.hostname === "s3.example.test") {
        const o = [...observations.values()].find((x) => u.pathname.endsWith(x.id));
        expect((init.headers as Record<string, string>)["content-type"]).toBe("image/jpeg");
        o!.uploaded = true;
        return new Response(null, { status: 200 });
      }
      expect((init.headers as Record<string, string>).authorization).toBe("Bearer tok");
      if (method === "POST" && u.pathname === "/sessions") {
        const created = !sessions.has(body.clientSessionId);
        if (created) sessions.set(body.clientSessionId, null);
        return json(created ? 201 : 200, { created, session: { id: body.clientSessionId } });
      }
      if (method === "POST" && u.pathname.endsWith("/observations")) {
        ObservationCaptureRequest.parse(body);
        expect(body.samplingMethod).toBe("DASHCAM_REPLAY");
        const existing = observations.get(body.clientObservationId);
        if (existing) {
          expect(JSON.stringify(body)).toBe(existing.body); // identical metadata on retry
          return json(200, { created: false, observation: { id: existing.id } });
        }
        const id = `obs-${observations.size + 1}`;
        observations.set(body.clientObservationId, { id, body: JSON.stringify(body), uploaded: false });
        return json(201, { created: true, observation: { id } });
      }
      if (method === "POST" && u.pathname === "/upload-url") {
        if (flaky-- > 0) return json(503, { error: { code: "SERVICE_UNAVAILABLE", message: "x" } });
        const o = [...observations.values()].find((x) => x.id === body.observationId)!;
        if (o.uploaded) return json(409, { error: { code: "ALREADY_UPLOADED", message: "done" } });
        return json(200, { method: "PUT", url: `https://s3.example.test/put/${o.id}`, headers: { "content-type": "image/jpeg", "content-length": String(body.contentLengthBytes) } });
      }
      if (method === "PATCH" && u.pathname.startsWith("/sessions/")) {
        const id = u.pathname.split("/")[2]!;
        if (sessions.get(id)) return json(409, { error: { code: "INVALID_TRANSITION", message: "ended" } });
        sessions.set(id, body.endedAt);
        return json(200, { session: { id } });
      }
      return json(404, { error: { code: "NOT_FOUND", message: "?" } });
    }) as unknown as typeof fetch;
    return { impl, observations, calls };
  }

  it("uploads only curated frames, retries transient errors, and is idempotent on re-run", async () => {
    const api = fakeApi();
    const cfg = { apiUrl: "https://api.example.test/", token: "tok", deviceId: "d", vehicleId: "v", redactedDir: dir, fetchImpl: api.impl };
    const first = await replay(plan, cfg);
    expect(first).toMatchObject({ planned: plan.frames.length, skippedMissing: plan.frames.length - 3, registered: 3, uploaded: 3, alreadyUploaded: 0 });

    const second = await replay(plan, cfg);
    expect(second).toMatchObject({ registered: 0, alreadyRegistered: 3, uploaded: 0, alreadyUploaded: 3 });
    expect(api.observations.size).toBe(3);
  }, 20_000);
});
