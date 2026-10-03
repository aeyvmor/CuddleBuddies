import { UtcInstant } from "@astig/contracts";
import { z } from "zod";
import { cumulativeDistances, pointAtDistance, type LonLat } from "./geo";
import { DASHCAM_NAMESPACE, sha256Text, uuidv5 } from "./ids";

const Lon = z.number().min(-180).max(180);
const Lat = z.number().min(-90).max(90);

/**
 * Hand-authored route file. The dashcam has no GPS, so the team traces the driven roads on a
 * map (e.g. geojson.io → LineString) and pins a few anchors: "at video second T the car was at
 * route vertex i". Between anchors the car is assumed to move at constant speed.
 */
export const RouteFile = z
  .strictObject({
    /** Short slug, e.g. "manila-espana-01". */
    name: z.string().regex(/^[a-z0-9-]{1,40}$/),
    /** Video path, relative to the route file. */
    video: z.string().min(1).max(500),
    /** Approximate UTC time the recording started. */
    recordedStartUtc: UtcInstant,
    /** Stated uncertainty of hand-traced positions (m). Sent as horizontalAccuracyM; never "exact". */
    locationAccuracyM: z.number().min(1).max(500),
    /** Driven path as GeoJSON-order [lon, lat] vertices. */
    route: z.array(z.tuple([Lon, Lat])).min(2).max(5000),
    anchors: z.array(z.strictObject({ videoSec: z.number().min(0), routeIndex: z.int().min(0) })).min(2).max(500),
    notes: z.string().max(1000).optional(),
  })
  .superRefine((r, ctx) => {
    r.anchors.forEach((a, i) => {
      if (a.routeIndex >= r.route.length) ctx.addIssue({ code: "custom", path: ["anchors", i, "routeIndex"], message: "routeIndex is past the end of route" });
      const prev = r.anchors[i - 1];
      if (prev && (a.videoSec <= prev.videoSec || a.routeIndex <= prev.routeIndex)) {
        ctx.addIssue({ code: "custom", path: ["anchors", i], message: "anchors must increase in both videoSec and routeIndex" });
      }
    });
  });
export type RouteFile = z.infer<typeof RouteFile>;

export interface PlannedFrame {
  index: number;
  videoSec: number;
  latitude: number;
  longitude: number;
  distanceAlongRouteM: number;
  capturedAt: string;
  clientObservationId: string;
}

export interface ReplayPlan {
  schema: "dashcam-plan.v1";
  name: string;
  videoFile: string;
  videoSha256: string;
  recordedStartUtc: string;
  locationAccuracyM: number;
  intervalM: number;
  sessionId: string;
  startLocation: { latitude: number; longitude: number };
  endedAt: string;
  frames: PlannedFrame[];
  warnings: string[];
}

const MAX_PLAUSIBLE_SPEED_MPS = 25; // 90 km/h in Metro Manila traffic is already generous

/**
 * Distance-based sampling along the traced route: one frame every `intervalM` metres between the
 * first and last anchor, with the video time interpolated piecewise-linearly between anchors.
 */
export function buildPlan(route: RouteFile, opts: { videoFile: string; videoSha256: string; intervalM: number }): ReplayPlan {
  if (!(opts.intervalM >= 1 && opts.intervalM <= 100)) throw new Error("intervalM must be within [1, 100]");
  const coords = route.route as LonLat[];
  const cum = cumulativeDistances(coords);
  const anchors = route.anchors.map((a) => ({ t: a.videoSec, d: cum[a.routeIndex]! }));
  const warnings: string[] = [];
  for (let i = 1; i < anchors.length; i++) {
    const dd = anchors[i]!.d - anchors[i - 1]!.d;
    const speed = dd / (anchors[i]!.t - anchors[i - 1]!.t);
    if (dd === 0) throw new Error(`anchors ${i - 1} and ${i} are at the same route position`);
    if (speed > MAX_PLAUSIBLE_SPEED_MPS) warnings.push(`segment ${i - 1}→${i} implies ${(speed * 3.6).toFixed(0)} km/h; check the anchors`);
  }

  const timeAt = (d: number): number => {
    let i = 1;
    while (i < anchors.length - 1 && anchors[i]!.d < d) i++;
    const a = anchors[i - 1]!;
    const b = anchors[i]!;
    return a.t + ((d - a.d) / (b.d - a.d)) * (b.t - a.t);
  };

  const routeHash = sha256Text(JSON.stringify({ route: route.route, anchors: route.anchors, start: route.recordedStartUtc }));
  const sessionId = uuidv5(`astig-dashcam:${opts.videoSha256}:${route.name}:${opts.intervalM}:${routeHash}`, DASHCAM_NAMESPACE);
  const startMs = Date.parse(route.recordedStartUtc);
  const startD = anchors[0]!.d;
  const endD = anchors[anchors.length - 1]!.d;

  const frames: PlannedFrame[] = [];
  for (let d = startD, index = 1; d <= endD + 1e-6; d += opts.intervalM, index++) {
    const [lon, lat] = pointAtDistance(coords, cum, d);
    const videoSec = Math.round(timeAt(d) * 1000) / 1000;
    frames.push({
      index,
      videoSec,
      latitude: Math.round(lat * 1e6) / 1e6,
      longitude: Math.round(lon * 1e6) / 1e6,
      distanceAlongRouteM: Math.round(d * 100) / 100,
      capturedAt: new Date(startMs + Math.round(videoSec * 1000)).toISOString(),
      clientObservationId: uuidv5(`${sessionId}:${index}`, DASHCAM_NAMESPACE),
    });
  }
  const [lon0, lat0] = pointAtDistance(coords, cum, startD);
  const startOffsetMs = Math.round(anchors[0]!.t * 1000);
  return {
    schema: "dashcam-plan.v1",
    name: route.name,
    videoFile: opts.videoFile,
    videoSha256: opts.videoSha256,
    recordedStartUtc: new Date(startMs + startOffsetMs).toISOString(),
    locationAccuracyM: route.locationAccuracyM,
    intervalM: opts.intervalM,
    sessionId,
    startLocation: { latitude: Math.round(lat0 * 1e6) / 1e6, longitude: Math.round(lon0 * 1e6) / 1e6 },
    endedAt: frames.length ? frames[frames.length - 1]!.capturedAt : new Date(startMs).toISOString(),
    frames,
    warnings,
  };
}

export const frameFileName = (index: number) => `${String(index).padStart(6, "0")}.jpg`;
