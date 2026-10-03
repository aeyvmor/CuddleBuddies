import { z } from "zod";
import { Coordinates, Uuid, UtcInstant } from "./common";
import { ProcessingStatus, SessionStatus } from "./observation";

/**
 * `POST /sessions` (role OPERATOR). The client generates `clientSessionId` (UUID) so a session
 * can be started offline and retried safely; it becomes the session id.
 */
export const CreateSessionRequest = z.strictObject({
  clientSessionId: Uuid,
  deviceId: Uuid,
  vehicleId: Uuid,
  startedAt: UtcInstant,
  startLocation: Coordinates,
});
export type CreateSessionRequest = z.infer<typeof CreateSessionRequest>;

/** `PATCH /sessions/{id}` — end a session. Ending again with the same time is a no-op. */
export const EndSessionRequest = z.strictObject({
  status: z.literal("ENDED"),
  endedAt: UtcInstant,
});
export type EndSessionRequest = z.infer<typeof EndSessionRequest>;

export const Session = z.strictObject({
  id: Uuid,
  deviceId: Uuid,
  vehicleId: Uuid,
  operatorSubject: z.string().min(1).max(200),
  status: SessionStatus,
  startedAt: UtcInstant,
  endedAt: UtcInstant.nullable(),
  startLocation: Coordinates,
  isSynthetic: z.boolean(),
});
export type Session = z.infer<typeof Session>;

export const SessionResponse = z.strictObject({ created: z.boolean().optional(), session: Session });
export type SessionResponse = z.infer<typeof SessionResponse>;

/** `POST /sessions/{id}/observations` response. The S3 key is never returned. */
export const RegisteredObservation = z.strictObject({
  id: Uuid,
  sessionId: Uuid,
  clientObservationId: Uuid,
  processingStatus: ProcessingStatus,
  isSynthetic: z.boolean(),
  createdAt: UtcInstant,
});
export const RegisterObservationResponse = z.strictObject({ created: z.boolean(), observation: RegisteredObservation });
export type RegisterObservationResponse = z.infer<typeof RegisterObservationResponse>;

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
export const UPLOAD_URL_TTL_SECONDS = 300;

/**
 * `POST /upload-url` (role OPERATOR). Returns a short-lived presigned PUT for the observation's
 * server-derived key. Content type and exact byte length are part of the signature.
 */
export const CreateUploadUrlRequest = z.strictObject({
  observationId: Uuid,
  contentType: z.literal("image/jpeg"),
  contentLengthBytes: z.int().min(1).max(MAX_UPLOAD_BYTES),
});
export type CreateUploadUrlRequest = z.infer<typeof CreateUploadUrlRequest>;

export const UploadUrlResponse = z.strictObject({
  method: z.literal("PUT"),
  url: z.url(),
  /** Headers the client must send unchanged with the PUT. */
  headers: z.strictObject({ "content-type": z.literal("image/jpeg"), "content-length": z.string() }),
  expiresAt: UtcInstant,
});
export type UploadUrlResponse = z.infer<typeof UploadUrlResponse>;
