import { z } from "zod";
import { Detection } from "./detection";

/**
 * Internal worker contract between the non-VPC ingest Lambda (vision provider) and the VPC
 * persistence Lambda (database). Not exposed through the public API.
 */
export const PROCESSING_SCHEMA_VERSION = "processing.v0" as const;

export const ProcessingFailureCode = z.enum([
  "PROVIDER_NOT_CONFIGURED",
  "PROVIDER_ERROR",
  "PROVIDER_TIMEOUT",
  "INVALID_MODEL_OUTPUT",
  "IMAGE_TOO_LARGE",
  "IMAGE_UNREADABLE",
]);
export type ProcessingFailureCode = z.infer<typeof ProcessingFailureCode>;

const ObjectKey = z.string().min(1).max(1024);

export const PersistRequest = z.discriminatedUnion("action", [
  z.strictObject({ schemaVersion: z.literal(PROCESSING_SCHEMA_VERSION), action: z.literal("BEGIN"), objectKey: ObjectKey }),
  /** A resolution ("after") image landed in S3: record the upload. No inference is run on it. */
  z.strictObject({ schemaVersion: z.literal(PROCESSING_SCHEMA_VERSION), action: z.literal("MARK_RESOLUTION_UPLOADED"), objectKey: ObjectKey }),
  z.strictObject({
    schemaVersion: z.literal(PROCESSING_SCHEMA_VERSION),
    action: z.literal("COMPLETE"),
    objectKey: ObjectKey,
    outcome: z.discriminatedUnion("kind", [
      z.strictObject({ kind: z.literal("DETECTION"), detection: Detection }),
      z.strictObject({ kind: z.literal("FAILURE"), code: ProcessingFailureCode, message: z.string().min(1).max(500) }),
    ]),
  }),
]);
export type PersistRequest = z.infer<typeof PersistRequest>;

export type BeginResult =
  | { proceed: true; observationId: string }
  | { proceed: false; reason: "UNKNOWN_OBJECT" | "ALREADY_COMPLETED" | "IN_PROGRESS" };

export type CompleteResult =
  | { applied: true; observationId: string; status: "COMPLETED" | "FAILED"; issueId: string | null }
  | { applied: false; reason: "UNKNOWN_OBJECT" | "NOT_PROCESSING" };

export type MarkResolutionResult = { marked: boolean; reason?: "UNKNOWN_OBJECT" | "ALREADY_MARKED" };
