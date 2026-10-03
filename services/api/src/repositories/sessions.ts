import type { CreateSessionRequest, EndSessionRequest, Session } from "@astig/contracts";
import { type Queryable, toIso, toIsoOrNull } from "@astig/database";
import { ApiError } from "../errors";

interface SessionRow {
  id: string;
  device_id: string;
  vehicle_id: string;
  operator_subject: string;
  status: "ACTIVE" | "ENDED";
  started_at: Date;
  ended_at: Date | null;
  start_latitude: number;
  start_longitude: number;
  is_synthetic: boolean;
  [key: string]: unknown;
}

const mapSession = (r: SessionRow): Session => ({
  id: r.id,
  deviceId: r.device_id,
  vehicleId: r.vehicle_id,
  operatorSubject: r.operator_subject,
  status: r.status,
  startedAt: toIso(r.started_at),
  endedAt: toIsoOrNull(r.ended_at),
  startLocation: { latitude: r.start_latitude, longitude: r.start_longitude },
  isSynthetic: r.is_synthetic,
});

/**
 * Starts a session with a client-generated id (offline-friendly). A retry with identical
 * content returns the existing session; reuse of the id for different content is a conflict.
 * Must run inside a transaction.
 */
export async function createSession(
  db: Queryable,
  params: { request: CreateSessionRequest; operatorSubject: string },
): Promise<{ created: boolean; session: Session }> {
  const { request: r, operatorSubject } = params;
  const sessionId = r.clientSessionId.toLowerCase();

  const existing = await db.query<SessionRow>("SELECT * FROM inspection_sessions WHERE id = $1", [sessionId]);
  if (existing.rows[0]) {
    const e = existing.rows[0];
    const same =
      e.operator_subject === operatorSubject &&
      e.device_id === r.deviceId.toLowerCase() &&
      e.vehicle_id === r.vehicleId.toLowerCase() &&
      e.started_at.getTime() === new Date(r.startedAt).getTime() &&
      e.start_latitude === r.startLocation.latitude &&
      e.start_longitude === r.startLocation.longitude;
    if (!same) throw new ApiError("IDEMPOTENCY_CONFLICT", "clientSessionId was already used with different content.");
    return { created: false, session: mapSession(e) };
  }

  const refs = await db.query<{ kind: string; is_synthetic: boolean }>(
    `SELECT 'device' AS kind, is_synthetic FROM devices WHERE id = $1
     UNION ALL SELECT 'vehicle', is_synthetic FROM vehicles WHERE id = $2`,
    [r.deviceId, r.vehicleId],
  );
  const device = refs.rows.find((x) => x.kind === "device");
  const vehicle = refs.rows.find((x) => x.kind === "vehicle");
  if (!device) throw new ApiError("VALIDATION_FAILED", "deviceId is not a registered device.");
  if (!vehicle) throw new ApiError("VALIDATION_FAILED", "vehicleId is not a registered vehicle.");

  const inserted = await db.query<SessionRow>(
    `INSERT INTO inspection_sessions (id, device_id, vehicle_id, operator_subject, status, started_at,
       start_latitude, start_longitude, is_synthetic)
     VALUES ($1, $2, $3, $4, 'ACTIVE', $5, $6, $7, $8)
     ON CONFLICT (id) DO NOTHING
     RETURNING *`,
    [sessionId, r.deviceId, r.vehicleId, operatorSubject, r.startedAt, r.startLocation.latitude, r.startLocation.longitude,
      device.is_synthetic || vehicle.is_synthetic],
  );
  if (!inserted.rows[0]) throw new ApiError("IDEMPOTENCY_CONFLICT", "Session was created concurrently; retry.");
  return { created: true, session: mapSession(inserted.rows[0]) };
}

/** Ends a session (operator only). Repeating the same end time is a no-op. */
export async function endSession(
  db: Queryable,
  params: { sessionId: string; request: EndSessionRequest; operatorSubject: string },
): Promise<Session> {
  const res = await db.query<SessionRow>("SELECT * FROM inspection_sessions WHERE id = $1 FOR UPDATE", [params.sessionId]);
  const s = res.rows[0];
  if (!s) throw new ApiError("NOT_FOUND", "Inspection session not found.");
  if (s.operator_subject !== params.operatorSubject) throw new ApiError("FORBIDDEN", "Only the session operator can end it.");
  const endedAt = new Date(params.request.endedAt);
  if (s.status === "ENDED") {
    if (s.ended_at?.getTime() === endedAt.getTime()) return mapSession(s);
    throw new ApiError("INVALID_TRANSITION", "Session has already ended.");
  }
  if (endedAt < s.started_at) throw new ApiError("VALIDATION_FAILED", "endedAt must not be before startedAt.");
  const updated = await db.query<SessionRow>(
    "UPDATE inspection_sessions SET status = 'ENDED', ended_at = $2 WHERE id = $1 RETURNING *",
    [params.sessionId, params.request.endedAt],
  );
  return mapSession(updated.rows[0]!);
}
