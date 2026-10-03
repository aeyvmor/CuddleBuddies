import type { Issue, IssueDetail, IssueFilters, WorkOrder, WorkOrderStatus } from "./types";

/**
 * The only surface the UI uses to reach data. Swap the mock for an HTTP
 * implementation once the contract is frozen; UI code does not change.
 */
export interface ApiClient {
  listIssues(filters: IssueFilters): Promise<Issue[]>;
  getIssue(id: string): Promise<IssueDetail>;
  /** Officer only. Rejects with ApiError. */
  createWorkOrder(issueId: string, input: { assignee: string | null; notes: string | null }): Promise<WorkOrder>;
  /** Officer only. Server validates the transition; rejects with ApiError. */
  updateWorkOrder(id: string, patch: { status?: WorkOrderStatus; assignee?: string | null; notes?: string | null }): Promise<WorkOrder>;
}
