/**
 * Server-derived private S3 key for an observation image. Clients never choose object keys;
 * the key is always scoped to the (authorized) session that owns the observation.
 */
export function evidenceObjectKey(sessionId: string, clientObservationId: string): string {
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
  const s = sessionId.toLowerCase();
  const o = clientObservationId.toLowerCase();
  if (!uuid.test(s) || !uuid.test(o)) throw new Error("evidenceObjectKey requires UUID identifiers");
  return `sessions/${s}/observations/${o}.jpg`;
}
