import type {
  CreateWorkOrderRequest,
  UpdateWorkOrderRequest,
  WorkOrder,
  WorkOrderStatus,
} from "@astig/contracts";
import { idempotencyFingerprint, isUniqueViolation, type Queryable, toIso, toIsoOrNull } from "@astig/database";
import { decideWorkOrderTransition } from "@astig/domain";
import { ApiError } from "../errors";

export interface WorkOrderRow {
  id: string;
  issue_id: string;
  risk_assessment_id: string;
  idempotency_fingerprint: string;
  status: WorkOrderStatus;
  assigned_team: string | null;
  notes: string | null;
  created_by_subject: string;
  created_at: Date;
  updated_at: Date;
  started_at: Date | null;
  resolved_at: Date | null;
  version: number;
  [key: string]: unknown;
}

export const mapWorkOrderRow = (r: WorkOrderRow): WorkOrder => ({
  id: r.id,
  issueId: r.issue_id,
  riskAssessmentId: r.risk_assessment_id,
  status: r.status,
  assignedTeam: r.assigned_team,
  notes: r.notes,
  createdBySubject: r.created_by_subject,
  createdAt: toIso(r.created_at),
  updatedAt: toIso(r.updated_at),
  startedAt: toIsoOrNull(r.started_at),
  resolvedAt: toIsoOrNull(r.resolved_at),
  version: r.version,
});

async function recordEvent(
  db: Queryable,
  e: { workOrderId: string; type: "CREATED" | "STATUS_CHANGED" | "UPDATED"; from: string | null; to: string | null; actor: string; fields: string[] },
): Promise<void> {
  await db.query(
    `INSERT INTO work_order_events (work_order_id, event_type, from_status, to_status, actor_subject, changed_fields)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [e.workOrderId, e.type, e.from, e.to, e.actor, e.fields],
  );
}

/**
 * Officer-approved work-order creation. Must run inside a transaction. The issue row is locked
 * so concurrent creates for the same issue serialize; unique constraints are the backstop.
 */
export async function createWorkOrder(
  db: Queryable,
  params: { issueId: string; request: CreateWorkOrderRequest; actorSubject: string },
): Promise<{ created: boolean; workOrder: WorkOrder }> {
  const { issueId, request, actorSubject } = params;
  const issue = await db.query<{ status: string }>("SELECT status FROM issues WHERE id = $1 FOR UPDATE", [issueId]);
  if (!issue.rows[0]) throw new ApiError("NOT_FOUND", "Issue not found.");

  const fingerprint = idempotencyFingerprint({
    riskAssessmentId: request.riskAssessmentId,
    assignedTeam: request.assignedTeam ?? null,
    notes: request.notes ?? null,
  });

  const replay = await db.query<WorkOrderRow>(
    "SELECT * FROM work_orders WHERE issue_id = $1 AND idempotency_key = $2",
    [issueId, request.idempotencyKey],
  );
  if (replay.rows[0]) {
    if (replay.rows[0].idempotency_fingerprint !== fingerprint) {
      throw new ApiError("IDEMPOTENCY_CONFLICT", "idempotencyKey was already used with a different request.");
    }
    return { created: false, workOrder: mapWorkOrderRow(replay.rows[0]) };
  }

  if (issue.rows[0].status !== "OPEN") {
    throw new ApiError("ISSUE_NOT_OPEN", "Work orders can only be created for OPEN issues.");
  }

  const ra = await db.query("SELECT 1 FROM risk_assessments WHERE id = $1 AND issue_id = $2", [request.riskAssessmentId, issueId]);
  if (!ra.rowCount) {
    throw new ApiError("RISK_ASSESSMENT_MISMATCH", "riskAssessmentId does not belong to this issue.");
  }

  const active = await db.query("SELECT 1 FROM work_orders WHERE issue_id = $1 AND status <> 'RESOLVED'", [issueId]);
  if (active.rowCount) {
    throw new ApiError("ACTIVE_WORK_ORDER_EXISTS", "This issue already has an active work order.");
  }

  let row: WorkOrderRow;
  try {
    const inserted = await db.query<WorkOrderRow>(
      `INSERT INTO work_orders (issue_id, risk_assessment_id, idempotency_key, idempotency_fingerprint,
         assigned_team, notes, created_by_subject)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [issueId, request.riskAssessmentId, request.idempotencyKey, fingerprint, request.assignedTeam ?? null, request.notes ?? null, actorSubject],
    );
    row = inserted.rows[0]!;
  } catch (err) {
    if (isUniqueViolation(err, "work_orders_one_active_per_issue")) {
      throw new ApiError("ACTIVE_WORK_ORDER_EXISTS", "This issue already has an active work order.");
    }
    throw err;
  }
  await recordEvent(db, { workOrderId: row.id, type: "CREATED", from: null, to: "OPEN", actor: actorSubject, fields: [] });
  return { created: true, workOrder: mapWorkOrderRow(row) };
}

/**
 * Validated lifecycle/assignment/notes update. Must run inside a transaction.
 * Same-status and unchanged-field requests are idempotent no-ops (safe client retries),
 * including on a RESOLVED work order; any real change to a RESOLVED order is rejected.
 */
export async function updateWorkOrder(
  db: Queryable,
  params: { workOrderId: string; request: UpdateWorkOrderRequest; actorSubject: string },
): Promise<WorkOrder> {
  const { workOrderId, request, actorSubject } = params;
  const current = await db.query<WorkOrderRow>("SELECT * FROM work_orders WHERE id = $1 FOR UPDATE", [workOrderId]);
  const wo = current.rows[0];
  if (!wo) throw new ApiError("NOT_FOUND", "Work order not found.");

  const changed: string[] = [];
  let nextStatus: WorkOrderStatus = wo.status;
  if (request.status !== undefined) {
    const decision = decideWorkOrderTransition(wo.status, request.status);
    if (decision.kind === "INVALID") {
      if (wo.status === "RESOLVED") throw new ApiError("WORK_ORDER_CLOSED", "Work order is RESOLVED and cannot be changed.");
      throw new ApiError(
        "INVALID_TRANSITION",
        `Cannot move work order from ${decision.from} to ${decision.to}.`,
        [{ path: "status", message: `allowed next status: ${decision.allowed.join(", ") || "none"}` }],
      );
    }
    if (decision.kind === "TRANSITION") {
      nextStatus = decision.to;
      changed.push("status");
    }
  }
  const nextTeam = request.assignedTeam === undefined ? wo.assigned_team : request.assignedTeam;
  const nextNotes = request.notes === undefined ? wo.notes : request.notes;
  if (nextTeam !== wo.assigned_team) changed.push("assignedTeam");
  if (nextNotes !== wo.notes) changed.push("notes");

  if (changed.length === 0) return mapWorkOrderRow(wo);
  if (wo.status === "RESOLVED") throw new ApiError("WORK_ORDER_CLOSED", "Work order is RESOLVED and cannot be changed.");

  const updated = await db.query<WorkOrderRow>(
    `UPDATE work_orders
        SET status = $2,
            assigned_team = $3,
            notes = $4,
            started_at = CASE WHEN $2 = 'IN_PROGRESS' AND started_at IS NULL THEN now() ELSE started_at END,
            resolved_at = CASE WHEN $2 = 'RESOLVED' AND resolved_at IS NULL THEN now() ELSE resolved_at END,
            updated_at = now(),
            version = version + 1
      WHERE id = $1
      RETURNING *`,
    [workOrderId, nextStatus, nextTeam, nextNotes],
  );
  const row = updated.rows[0]!;

  const statusChanged = nextStatus !== wo.status;
  await recordEvent(db, {
    workOrderId,
    type: statusChanged ? "STATUS_CHANGED" : "UPDATED",
    from: statusChanged ? wo.status : null,
    to: statusChanged ? nextStatus : null,
    actor: actorSubject,
    fields: changed,
  });

  if (nextStatus === "RESOLVED" && statusChanged) {
    await db.query("UPDATE issues SET status = 'RESOLVED', updated_at = now() WHERE id = $1", [wo.issue_id]);
  }
  return mapWorkOrderRow(row);
}
