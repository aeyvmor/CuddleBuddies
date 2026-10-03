/**
 * Local capture queue. Pure functions, tested without a device.
 *
 * Every attempt becomes one entry, oldest first:
 * - CAPTURED: a stored image plus its contract-shaped record (src/capture.ts). Its
 *   `upload` field is where an uploader will later record progress. Today the only
 *   state is PENDING, because nothing is uploaded in this build.
 * - FAILED: the attempt and why it failed. There is deliberately no function that
 *   turns a FAILED entry into a CAPTURED one: a failure stays a failure.
 */
import type { CaptureRequest, SamplingMethod } from "./capture.ts";

export type FailureReason = "NO_LOCATION_FIX" | "IMAGE_FAILED" | "IMAGE_NOT_SAVED";

/** Extend with UPLOADING / UPLOADED / UPLOAD_FAILED when an uploader exists. */
export type UploadState = { state: "PENDING" };

export interface StoredImage {
  uri: string;
  width: number;
  height: number;
  source: "CAMERA" | "AR_FRAME";
}

export interface CapturedEntry {
  kind: "CAPTURED";
  clientSessionId: string;
  request: CaptureRequest;
  image: StoredImage;
  upload: UploadState;
}

export interface FailedEntry {
  kind: "FAILED";
  clientSessionId: string;
  attemptedAt: string;
  samplingMethod: SamplingMethod;
  reason: FailureReason;
  /** Short technical detail for the team; never shown as the main message. */
  detail: string | null;
}

export type QueueEntry = CapturedEntry | FailedEntry;

export function addEntry(queue: QueueEntry[], entry: QueueEntry): QueueEntry[] {
  return [...queue, entry];
}

export interface QueueCounts {
  captured: number;
  failed: number;
  waitingUpload: number;
}

export function queueCounts(queue: QueueEntry[], clientSessionId?: string): QueueCounts {
  const counts: QueueCounts = { captured: 0, failed: 0, waitingUpload: 0 };
  for (const e of queue) {
    if (clientSessionId && e.clientSessionId !== clientSessionId) continue;
    if (e.kind === "FAILED") counts.failed += 1;
    else {
      counts.captured += 1;
      if (e.upload.state === "PENDING") counts.waitingUpload += 1;
    }
  }
  return counts;
}

export function latestCaptured(queue: QueueEntry[], clientSessionId?: string): CapturedEntry | null {
  for (let i = queue.length - 1; i >= 0; i--) {
    const e = queue[i]!;
    if (e.kind === "CAPTURED" && (!clientSessionId || e.clientSessionId === clientSessionId)) return e;
  }
  return null;
}

export function latestFailure(queue: QueueEntry[], clientSessionId?: string): FailedEntry | null {
  for (let i = queue.length - 1; i >= 0; i--) {
    const e = queue[i]!;
    if (e.kind === "FAILED" && (!clientSessionId || e.clientSessionId === clientSessionId)) return e;
  }
  return null;
}

/** What an uploader will work through, oldest first. */
export function pendingUploads(queue: QueueEntry[]): CapturedEntry[] {
  return queue.filter((e): e is CapturedEntry => e.kind === "CAPTURED" && e.upload.state === "PENDING");
}

export const FAILURE_TEXT: Record<FailureReason, string> = {
  NO_LOCATION_FIX: "No GPS fix",
  IMAGE_FAILED: "Camera did not return a photo",
  IMAGE_NOT_SAVED: "Photo could not be saved",
};
