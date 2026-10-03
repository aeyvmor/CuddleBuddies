import { MAX_UPLOAD_BYTES } from "@astig/contracts";

/** Limits the API enforces for "after" photos (requirement 12). */
export const RESOLUTION_MAX_BYTES = MAX_UPLOAD_BYTES;
export const RESOLUTION_MAX_PER_WORK_ORDER = 5;

/**
 * Checks a chosen file before any request is made. Returns the problem in words, or null.
 * JPEG only: some systems report an empty type, so a .jpg/.jpeg name is accepted then.
 */
export function checkResolutionFile(file: { name: string; type: string; size: number }): string | null {
  const jpegName = /\.jpe?g$/i.test(file.name);
  const isJpeg = file.type === "image/jpeg" || (file.type === "" && jpegName);
  if (!isJpeg) return "Choose a JPEG photo (.jpg or .jpeg).";
  if (file.size <= 0) return "This file is empty.";
  if (file.size > RESOLUTION_MAX_BYTES) return `This photo is ${(file.size / 1024 / 1024).toFixed(1)} MB; the limit is 10 MB.`;
  return null;
}
