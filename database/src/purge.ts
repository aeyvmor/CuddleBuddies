import type { Queryable } from "./support";

/**
 * Deletes everything captured by one device: its sessions, observations, detections, and the issues
 * built ONLY from those observations (with their scores and work orders). Refuses (throws) if any
 * affected issue also contains observations from other devices, so shared evidence is never lost.
 * S3 objects are not deleted here; they are private and expire with the bucket lifecycle.
 * Must run inside a transaction.
 */
export async function purgeDeviceData(db: Queryable, deviceId: string) {
  const sessions = (await db.query<{ id: string }>("SELECT id FROM inspection_sessions WHERE device_id = $1", [deviceId])).rows.map((r) => r.id);
  if (sessions.length === 0) return { sessions: 0, observations: 0, issues: 0, workOrders: 0 };

  const issues = (
    await db.query<{ issue_id: string }>("SELECT DISTINCT issue_id FROM observations WHERE session_id = ANY($1::uuid[]) AND issue_id IS NOT NULL", [sessions])
  ).rows.map((r) => r.issue_id);
  const mixed = await db.query(
    "SELECT 1 FROM observations WHERE issue_id = ANY($1::uuid[]) AND NOT (session_id = ANY($2::uuid[])) LIMIT 1",
    [issues, sessions],
  );
  if (mixed.rowCount) throw new Error("Refusing: some affected issues also contain observations from other devices.");

  const wos = (await db.query<{ id: string }>("SELECT id FROM work_orders WHERE issue_id = ANY($1::uuid[])", [issues])).rows.map((r) => r.id);
  await db.query("DELETE FROM resolution_evidence WHERE work_order_id = ANY($1::uuid[])", [wos]);
  await db.query("DELETE FROM work_order_events WHERE work_order_id = ANY($1::uuid[])", [wos]);
  await db.query("DELETE FROM work_orders WHERE id = ANY($1::uuid[])", [wos]);
  await db.query("DELETE FROM detections WHERE observation_id IN (SELECT id FROM observations WHERE session_id = ANY($1::uuid[]))", [sessions]);
  const obs = await db.query("DELETE FROM observations WHERE session_id = ANY($1::uuid[])", [sessions]);
  await db.query("DELETE FROM risk_assessments WHERE issue_id = ANY($1::uuid[])", [issues]); // components cascade
  await db.query("DELETE FROM issues WHERE id = ANY($1::uuid[])", [issues]);
  await db.query("DELETE FROM inspection_sessions WHERE id = ANY($1::uuid[])", [sessions]);
  return { sessions: sessions.length, observations: obs.rowCount ?? 0, issues: issues.length, workOrders: wos.length };
}
