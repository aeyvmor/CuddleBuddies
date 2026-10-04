/**
 * The upload copy of a capture: downscaled to UPLOAD_LONG_EDGE_PX on the long side (JPEG
 * quality UPLOAD_JPEG_QUALITY) into the cache, uploaded, then deleted. The full-resolution
 * original in captures/ is never changed. Smaller images upload faster on mobile data and
 * are what the vision model needs (docs/api/integration-guide.md).
 */
import { File } from "expo-file-system";
import { ImageManipulator, SaveFormat } from "expo-image-manipulator";
import { MAX_UPLOAD_BYTES } from "./api/contracts";
import { UPLOAD_JPEG_QUALITY, UPLOAD_LONG_EDGE_PX } from "./api/config";
import type { CapturedEntry } from "./queue";
import type { PreparedImage } from "./upload";

export async function prepareUploadImage(entry: CapturedEntry): Promise<PreparedImage> {
  const original = new File(entry.image.uri);
  if (!original.exists) throw new Error("The photo file for this capture is missing on the phone.");
  const { width, height } = entry.image;
  const longEdge = Math.max(width, height);

  let file = original;
  let temporary = false;
  if (longEdge > UPLOAD_LONG_EDGE_PX) {
    const ctx = ImageManipulator.manipulate(entry.image.uri);
    ctx.resize(width >= height ? { width: UPLOAD_LONG_EDGE_PX } : { height: UPLOAD_LONG_EDGE_PX });
    const ref = await ctx.renderAsync();
    const saved = await ref.saveAsync({ compress: UPLOAD_JPEG_QUALITY, format: SaveFormat.JPEG });
    file = new File(saved.uri);
    temporary = true;
  }
  const bytes = file.size;
  if (!(bytes > 0)) throw new Error("The upload copy of this photo is empty.");
  if (bytes > MAX_UPLOAD_BYTES) throw new Error(`The upload copy is ${(bytes / 1024 / 1024).toFixed(1)} MB; the limit is 10 MB.`);
  return {
    // An expo-file-system File is Blob-like; expo/fetch sends it as the request body.
    body: file as unknown as Blob,
    bytes,
    dispose: () => {
      if (!temporary) return;
      try {
        if (file.exists) file.delete();
      } catch {
        /* cache file; Android clears the cache anyway */
      }
    },
  };
}
