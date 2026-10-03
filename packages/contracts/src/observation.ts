import { z } from "zod";
import { Coordinates, NullableMetres, Uuid, UtcInstant } from "./common";

export const SessionStatus = z.enum(["ACTIVE", "ENDED"]);
export type SessionStatus = z.infer<typeof SessionStatus>;

/**
 * How the capture trigger estimated travelled distance. Surfaced so GPS-delta sampling is never
 * presented as VIO, and replayed dashcam frames are never presented as live on-device sampling.
 */
export const SamplingMethod = z.enum(["VIO_DISTANCE", "GPS_DISTANCE", "MANUAL", "DASHCAM_REPLAY"]);
export type SamplingMethod = z.infer<typeof SamplingMethod>;

export const ProcessingStatus = z.enum(["PENDING", "PROCESSING", "COMPLETED", "FAILED"]);
export type ProcessingStatus = z.infer<typeof ProcessingStatus>;

export const OBSERVATION_CAPTURE_SCHEMA_VERSION = "observation-capture.v0" as const;

/**
 * Capture metadata registered by the mobile client. The client never supplies an S3 key;
 * the server derives one scoped to the authorized session.
 */
export const ObservationCaptureRequest = z.strictObject({
  schemaVersion: z.literal(OBSERVATION_CAPTURE_SCHEMA_VERSION),
  clientObservationId: Uuid,
  sequenceNumber: z.int().min(0).max(1_000_000),
  capturedAt: UtcInstant,
  location: Coordinates,
  horizontalAccuracyM: NullableMetres,
  samplingMethod: SamplingMethod,
  distanceFromPreviousM: NullableMetres,
});
export type ObservationCaptureRequest = z.infer<typeof ObservationCaptureRequest>;

export const ProcessingError = z.strictObject({
  code: z.string().min(1).max(64),
  message: z.string().min(1).max(500),
});
export type ProcessingError = z.infer<typeof ProcessingError>;
