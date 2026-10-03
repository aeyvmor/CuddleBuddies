/** "BLOCKED_DRAIN" -> "Blocked drain". Display text only; never used as a key. */
export function label(code: string): string {
  const s = code.replace(/_/g, " ").toLowerCase();
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function formatUtc(iso: string): string {
  return `${iso.replace("T", " ").replace(/:\d\d(\.\d+)?Z$/, "")} UTC`;
}
