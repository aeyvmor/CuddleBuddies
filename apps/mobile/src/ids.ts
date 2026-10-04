/**
 * RFC 9562 version-4 UUIDs from a CSPRNG (crypto.getRandomValues). On the phone the source is
 * react-native-get-random-values, loaded first in index.ts; Node (tests) has Web Crypto built in.
 * Ids are idempotency keys for the API, so a predictable generator (Math.random) is not used.
 */
export function newId(): string {
  const c = (globalThis as { crypto?: { randomUUID?: () => string; getRandomValues?: <T extends ArrayBufferView>(a: T) => T } }).crypto;
  if (c?.randomUUID) return c.randomUUID();
  if (!c?.getRandomValues) throw new Error("No secure random source: react-native-get-random-values is not loaded.");
  const b = c.getRandomValues(new Uint8Array(16));
  b[6] = (b[6]! & 0x0f) | 0x40;
  b[8] = (b[8]! & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}
