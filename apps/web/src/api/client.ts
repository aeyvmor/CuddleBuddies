import type {
  CreateWorkOrderRequest,
  CreateWorkOrderResponse,
  IssueDetailResponse,
  IssueListFilters,
  IssueListItem,
  UpdateWorkOrderRequest,
  UpdateWorkOrderResponse,
} from "./types";

/**
 * The only surface the UI uses to reach data. Request and response shapes are
 * the contract's, except listIssues (no list route exists yet: gap G1).
 * Swap the mock for an HTTP implementation later; UI code does not change.
 */
export interface ApiClient {
  /** [gap G1] No contract route. */
  listIssues(filters: IssueListFilters): Promise<IssueListItem[]>;
  /** GET /issues/{id} (OFFICER). */
  getIssue(id: string): Promise<IssueDetailResponse>;
  /** POST /issues/{id}/work-orders (OFFICER). Same idempotencyKey + body replays the original. */
  createWorkOrder(issueId: string, body: CreateWorkOrderRequest): Promise<CreateWorkOrderResponse>;
  /** PATCH /work-orders/{id} (OFFICER). */
  updateWorkOrder(id: string, body: UpdateWorkOrderRequest): Promise<UpdateWorkOrderResponse>;
}
