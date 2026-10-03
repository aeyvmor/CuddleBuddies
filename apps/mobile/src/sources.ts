/**
 * Distance sources the operator can choose. Each maps to exactly one contract
 * samplingMethod (packages/contracts/src/observation.ts); GPS is never VIO.
 *
 * Copy rules: say what the source is and what it has been tested on. No accuracy
 * claims: none of these has a measured accuracy yet (see README "Feasibility findings").
 */
import type { SamplingMethod } from "./capture.ts";

export type DistanceSource = "GPS_SPEED" | "AR_VIO" | "MANUAL_ONLY";

export interface SourceInfo {
  id: DistanceSource;
  /** Recorded on captures the distance trigger takes. */
  samplingMethod: SamplingMethod;
  title: string;
  /** One line under the title on the setup screen. */
  summary: string;
  /** What has (not) been tested, in plain words. */
  testing: string;
  /** Short words for the active screen. */
  activeLabel: string;
  experimental: boolean;
  image: "CAMERA" | "AR_FRAME";
  /** False for manual-only: no distance trigger at all. */
  autoCapture: boolean;
}

export const SOURCES: Record<DistanceSource, SourceInfo> = {
  GPS_SPEED: {
    id: "GPS_SPEED",
    samplingMethod: "GPS_DISTANCE",
    title: "GPS speed distance",
    summary: "For vehicles. Counts distance from the speed GPS reports. Photos use the phone camera at full resolution.",
    testing: "Not yet tried outdoors or in a vehicle. Reads nothing indoors.",
    activeLabel: "GPS speed distance",
    experimental: false,
    image: "CAMERA",
    autoCapture: true,
  },
  AR_VIO: {
    id: "AR_VIO",
    samplingMethod: "VIO_DISTANCE",
    title: "AR tracking with motion gate",
    summary: "Counts camera-tracked movement only while the motion sensors say the phone is moving. Images are frames of the AR view, smaller than camera photos.",
    testing: "Tested only indoors, hand-held, on one short walk. Counts walking speed only, not vehicle speed.",
    activeLabel: "AR tracking (experimental)",
    experimental: true,
    image: "AR_FRAME",
    autoCapture: true,
  },
  MANUAL_ONLY: {
    id: "MANUAL_ONLY",
    samplingMethod: "MANUAL",
    title: "Manual only",
    summary: "No distance trigger. A photo is taken only when someone taps Capture. Not for the driver while moving.",
    testing: "Photos use the phone camera at full resolution.",
    activeLabel: "Manual capture only",
    experimental: false,
    image: "CAMERA",
    autoCapture: false,
  },
};

export const SOURCE_ORDER: DistanceSource[] = ["GPS_SPEED", "AR_VIO", "MANUAL_ONLY"];

/**
 * A tap is recorded as MANUAL in every mode: a tap carries no travelled-distance claim,
 * so buildCaptureRequest sets distanceFromPreviousM to null. Only the distance trigger
 * records the source's own method.
 */
export function samplingMethodFor(source: DistanceSource, trigger: "DISTANCE" | "TAP"): SamplingMethod {
  if (trigger === "TAP") return "MANUAL";
  if (!SOURCES[source].autoCapture) throw new Error(`${source} has no distance trigger`);
  return SOURCES[source].samplingMethod;
}
