/**
 * Phone-storage guard for long routes. Pure, tested without a device.
 *
 * A full-resolution photo is a few megabytes, and a capture every ~7 m adds up fast in a
 * vehicle. Below MIN_FREE_BYTES a capture is refused and recorded as a LOW_STORAGE failure
 * (visible, never silent); below LOW_FREE_BYTES the active screen warns.
 */
import type { QueueEntry } from "./queue.ts";

const MB = 1024 * 1024;
const GB = 1024 * MB;

/** Leave room for Android, the app's own state and the journal. */
export const MIN_FREE_BYTES = 500 * MB;
export const LOW_FREE_BYTES = 2 * GB;

export type StorageLevel = "OK" | "LOW" | "FULL";

/** Null when the phone did not report free space. */
export function storageLevel(freeBytes: number | null): StorageLevel | null {
  if (freeBytes === null || !Number.isFinite(freeBytes) || freeBytes < 0) return null;
  if (freeBytes < MIN_FREE_BYTES) return "FULL";
  if (freeBytes < LOW_FREE_BYTES) return "LOW";
  return "OK";
}

export interface PhotoStats {
  count: number;
  /** Total bytes of photos whose size is known. */
  bytes: number;
  /** Mean size of photos whose size is known; null when none is known. */
  averageBytes: number | null;
}

export function photoStats(queue: QueueEntry[], clientSessionId?: string): PhotoStats {
  let count = 0;
  let known = 0;
  let bytes = 0;
  for (const e of queue) {
    if (e.kind !== "CAPTURED" || (clientSessionId && e.clientSessionId !== clientSessionId)) continue;
    count += 1;
    const b = e.image.bytes;
    if (typeof b === "number" && b > 0) {
      known += 1;
      bytes += b;
    }
  }
  return { count, bytes, averageBytes: known > 0 ? bytes / known : null };
}

/** Photos that still fit before captures are refused; null without enough data to say. */
export function photosRemaining(freeBytes: number | null, averageBytes: number | null): number | null {
  if (freeBytes === null || averageBytes === null || !(averageBytes > 0)) return null;
  return Math.max(0, Math.floor((freeBytes - MIN_FREE_BYTES) / averageBytes));
}

/** "86 GB", "1.4 GB", "312 MB", "640 KB". */
export function formatBytes(n: number): string {
  if (n >= 10 * GB) return `${Math.round(n / GB)} GB`;
  if (n >= GB) return `${(n / GB).toFixed(1)} GB`;
  if (n >= MB) return `${Math.round(n / MB)} MB`;
  return `${Math.max(0, Math.round(n / 1024))} KB`;
}

/** "about 30,000" style, rounded so the number does not jitter on every capture. */
export function formatCount(n: number): string {
  const rounded = n >= 10_000 ? Math.round(n / 1000) * 1000 : n >= 1000 ? Math.round(n / 100) * 100 : n;
  return rounded.toLocaleString("en-US");
}
