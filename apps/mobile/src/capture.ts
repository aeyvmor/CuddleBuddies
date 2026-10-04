/**
 * Capture metadata in the shape of the contract's ObservationCaptureRequest
 * (packages/contracts/src/observation.ts, observation-capture.v0). The contract is not
 * imported (apps/mobile is outside the workspaces); field names and enum values are copied
 * and checked against it. Pure functions, tested without a device.
 */
import { newId } from "./ids.ts";

export type SamplingMethod = "VIO_DISTANCE" | "GPS_DISTANCE" | "MANUAL";

export const CAPTURE_SCHEMA_VERSION = "observation-capture.v0";

export interface CaptureRequest {
  schemaVersion: typeof CAPTURE_SCHEMA_VERSION;
  clientObservationId: string;
  sequenceNumber: number;
  /** UTC ISO-8601 with trailing Z. */
  capturedAt: string;
  location: { latitude: number; longitude: number };
  /** Device-reported horizontal accuracy in metres; null when not reported. */
  horizontalAccuracyM: number | null;
  samplingMethod: SamplingMethod;
  /** Null for MANUAL: a tap carries no travelled-distance claim. */
  distanceFromPreviousM: number | null;
}

export interface CaptureInput {
  sequenceNumber: number;
  capturedAt: Date;
  /** Latest GPS fix, or null when the device has none. */
  fix: { latitude: number; longitude: number; accuracyM: number | null } | null;
  samplingMethod: SamplingMethod;
  distanceFromPreviousM: number | null;
  random?: () => number;
}

export type CaptureBuild = { ok: true; request: CaptureRequest } | { ok: false; reason: "NO_LOCATION_FIX" };

/**
 * RFC 9562 version-4 UUID. Without `random` it comes from the CSPRNG (src/ids.ts); tests may
 * pass a deterministic `random` to get repeatable ids.
 */
export function uuidV4(random?: () => number): string {
  if (!random) return newId();
  const hex = (n: number) => Array.from({ length: n }, () => Math.floor(random() * 16).toString(16)).join("");
  const variant = (8 + Math.floor(random() * 4)).toString(16);
  return `${hex(8)}-${hex(4)}-4${hex(3)}-${variant}${hex(3)}-${hex(12)}`;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * A capture without a location fix is refused, not filled in: the contract requires
 * coordinates, and inventing them would misstate where the evidence was taken.
 */
export function buildCaptureRequest(input: CaptureInput): CaptureBuild {
  if (!input.fix) return { ok: false, reason: "NO_LOCATION_FIX" };
  const manual = input.samplingMethod === "MANUAL";
  return {
    ok: true,
    request: {
      schemaVersion: CAPTURE_SCHEMA_VERSION,
      clientObservationId: uuidV4(input.random),
      sequenceNumber: input.sequenceNumber,
      capturedAt: input.capturedAt.toISOString(),
      location: { latitude: input.fix.latitude, longitude: input.fix.longitude },
      horizontalAccuracyM: input.fix.accuracyM === null ? null : round2(input.fix.accuracyM),
      samplingMethod: input.samplingMethod,
      distanceFromPreviousM: manual || input.distanceFromPreviousM === null ? null : round2(Math.max(0, input.distanceFromPreviousM)),
    },
  };
}
