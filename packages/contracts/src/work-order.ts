import { z } from "zod";
import { Uuid, UtcInstant, boundedText } from "./common";

export const WorkOrderStatus = z.enum(["OPEN", "IN_PROGRESS", "RESOLVED"]);
export type WorkOrderStatus = z.infer<typeof WorkOrderStatus>;

/** Team or department name (not a person's name, to keep personal data out of work orders). */
const AssignedTeam = boundedText(120);
const Notes = boundedText(2000);

export const WorkOrder = z.strictObject({
  id: Uuid,
  issueId: Uuid,
  riskAssessmentId: Uuid,
  status: WorkOrderStatus,
  assignedTeam: AssignedTeam.nullable(),
  notes: Notes.nullable(),
  createdBySubject: z.string().min(1).max(200),
  createdAt: UtcInstant,
  updatedAt: UtcInstant,
  startedAt: UtcInstant.nullable(),
  resolvedAt: UtcInstant.nullable(),
  version: z.int().min(1),
});
export type WorkOrder = z.infer<typeof WorkOrder>;

/** `POST /issues/{id}/work-orders` — officer approval. Replays with the same key return the original. */
export const CreateWorkOrderRequest = z.strictObject({
  idempotencyKey: Uuid,
  /** The risk assessment the officer reviewed; must belong to the issue. */
  riskAssessmentId: Uuid,
  assignedTeam: AssignedTeam.optional(),
  notes: Notes.optional(),
});
export type CreateWorkOrderRequest = z.infer<typeof CreateWorkOrderRequest>;

/** `PATCH /work-orders/{id}` — lifecycle/assignment/notes. `null` clears an optional field. */
export const UpdateWorkOrderRequest = z
  .strictObject({
    status: WorkOrderStatus.optional(),
    assignedTeam: AssignedTeam.nullable().optional(),
    notes: Notes.nullable().optional(),
  })
  .refine((b) => b.status !== undefined || b.assignedTeam !== undefined || b.notes !== undefined, {
    message: "at least one of status, assignedTeam, notes is required",
  });
export type UpdateWorkOrderRequest = z.infer<typeof UpdateWorkOrderRequest>;

export const CreateWorkOrderResponse = z.strictObject({ created: z.boolean(), workOrder: WorkOrder });
export type CreateWorkOrderResponse = z.infer<typeof CreateWorkOrderResponse>;

export const UpdateWorkOrderResponse = z.strictObject({ workOrder: WorkOrder });
export type UpdateWorkOrderResponse = z.infer<typeof UpdateWorkOrderResponse>;
