const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const UUID_RE = new RegExp(`^${UUID}$`);
const KEY_RE = new RegExp(`^sessions/(${UUID})/observations/(${UUID})\\.jpg$`);
const RESOLUTION_KEY_RE = new RegExp(`^work-orders/(${UUID})/resolution/(${UUID})\\.jpg$`);

function ids(...values: string[]): string[] {
  const out = values.map((v) => v.toLowerCase());
  if (!out.every((v) => UUID_RE.test(v))) throw new Error("object keys require UUID identifiers");
  return out;
}

/**
 * Server-derived private S3 key for an observation image. Clients never choose object keys;
 * the key is always scoped to the (authorized) session that owns the observation.
 */
export function evidenceObjectKey(sessionId: string, clientObservationId: string): string {
  const [s, o] = ids(sessionId, clientObservationId);
  return `sessions/${s}/observations/${o}.jpg`;
}

/** Inverse of evidenceObjectKey; returns null for any key ASTIG did not issue. */
export function parseEvidenceObjectKey(key: string): { sessionId: string; clientObservationId: string } | null {
  const m = KEY_RE.exec(key);
  return m ? { sessionId: m[1]!, clientObservationId: m[2]! } : null;
}

/** Server-derived key for a work order's resolution ("after") image. */
export function resolutionObjectKey(workOrderId: string, clientEvidenceId: string): string {
  const [w, e] = ids(workOrderId, clientEvidenceId);
  return `work-orders/${w}/resolution/${e}.jpg`;
}

export function parseResolutionObjectKey(key: string): { workOrderId: string; clientEvidenceId: string } | null {
  const m = RESOLUTION_KEY_RE.exec(key);
  return m ? { workOrderId: m[1]!, clientEvidenceId: m[2]! } : null;
}
