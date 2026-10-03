import type { WorkOrderStatus } from "@astig/contracts";

/** Allowed forward transitions. RESOLVED is terminal in v0. */
export const WORK_ORDER_TRANSITIONS: Readonly<Record<WorkOrderStatus, readonly WorkOrderStatus[]>> = Object.freeze({
  OPEN: ["IN_PROGRESS"],
  IN_PROGRESS: ["RESOLVED"],
  RESOLVED: [],
});

export type TransitionDecision =
  | { kind: "NOOP" }
  | { kind: "TRANSITION"; from: WorkOrderStatus; to: WorkOrderStatus }
  | { kind: "INVALID"; from: WorkOrderStatus; to: WorkOrderStatus; allowed: readonly WorkOrderStatus[] };

export function isTerminalWorkOrderStatus(status: WorkOrderStatus): boolean {
  return WORK_ORDER_TRANSITIONS[status].length === 0;
}

/** Same-status requests are idempotent no-ops; everything else must be an allowed forward step. */
export function decideWorkOrderTransition(from: WorkOrderStatus, to: WorkOrderStatus): TransitionDecision {
  if (from === to) return { kind: "NOOP" };
  const allowed = WORK_ORDER_TRANSITIONS[from];
  return allowed.includes(to) ? { kind: "TRANSITION", from, to } : { kind: "INVALID", from, to, allowed };
}
