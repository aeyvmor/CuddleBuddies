import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";

/** RFC 9562 UUIDv5 (SHA-1, name-based). Deterministic ids make replays safely re-runnable. */
export function uuidv5(name: string, namespace: string): string {
  const ns = Buffer.from(namespace.replace(/-/g, ""), "hex");
  if (ns.length !== 16) throw new Error("namespace must be a UUID");
  const h = createHash("sha1").update(ns).update(name, "utf8").digest();
  h[6] = (h[6]! & 0x0f) | 0x50;
  h[8] = (h[8]! & 0x3f) | 0x80;
  const x = h.subarray(0, 16).toString("hex");
  return `${x.slice(0, 8)}-${x.slice(8, 12)}-${x.slice(12, 16)}-${x.slice(16, 20)}-${x.slice(20, 32)}`;
}

/** Fixed namespace for ASTIG dashcam replays (randomly generated once). */
export const DASHCAM_NAMESPACE = "8d4f6a1e-3c2b-4e5f-9a7d-2b1c0e9f8a63";

export async function sha256File(path: string): Promise<string> {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(path)) hash.update(chunk as Buffer);
  return hash.digest("hex");
}

export const sha256Text = (s: string) => createHash("sha256").update(s).digest("hex");
