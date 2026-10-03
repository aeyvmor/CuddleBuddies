const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const UUID_RE = new RegExp(`^${UUID}$`);
const KEY_RE = new RegExp(`^sessions/(${UUID})/observations/(${UUID})\\.jpg$`);

/**
 * Server-derived private S3 key for an observation image. Clients never choose object keys;
 * the key is always scoped to the (authorized) session that owns the observation.
 */
export function evidenceObjectKey(sessionId: string, clientObservationId: string): string {
  const s = sessionId.toLowerCase();
  const o = clientObservationId.toLowerCase();
  if (!UUID_RE.test(s) || !UUID_RE.test(o)) throw new Error("evidenceObjectKey requires UUID identifiers");
  return `sessions/${s}/observations/${o}.jpg`;
}

/** Inverse of evidenceObjectKey; returns null for any key ASTIG did not issue. */
export function parseEvidenceObjectKey(key: string): { sessionId: string; clientObservationId: string } | null {
  const m = KEY_RE.exec(key);
  return m ? { sessionId: m[1]!, clientObservationId: m[2]! } : null;
}
