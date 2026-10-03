import type { WorkOrderStatus } from "../api/types";

/**
 * UI hint only: which single forward step to offer. The API is authoritative
 * and must re-validate every transition. Move to packages/domain when it exists.
 */
const NEXT: Record<WorkOrderStatus, WorkOrderStatus | null> = {
  OPEN: "IN_PROGRESS",
  IN_PROGRESS: "RESOLVED",
  RESOLVED: null,
};

export function nextWorkOrderStatus(current: WorkOrderStatus): WorkOrderStatus | null {
  return NEXT[current];
}

export function isValidTransition(from: WorkOrderStatus, to: WorkOrderStatus): boolean {
  return NEXT[from] === to;
}
