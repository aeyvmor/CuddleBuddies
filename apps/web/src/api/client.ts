import type {
  AnalyticsSummaryResponse,
  CreateWorkOrderRequest,
  CreateWorkOrderResponse,
  IssueDetailResponse,
  IssueListFilters,
  IssueListResponse,
  UpdateWorkOrderRequest,
  UpdateWorkOrderResponse,
} from "./types";

/** An "after" photo for a work order (requirement 12). */
export interface ResolutionPhotoInput {
  /** Generated once per user action and reused if that action is retried. */
  clientEvidenceId: string;
  /** JPEG bytes (a File from the file input). */
  file: Blob;
  note?: string;
}

/**
 * The only surface the UI uses to reach data. Shapes are the contract's.
 * Two implementations: the in-memory mock (tests, offline demo) and the HTTP client
 * over @astig/api-client (live). UI code does not know which one it has.
 */
export interface ApiClient {
  /** GET /issues (OFFICER). All pages the client loads, plus area names for the filter. */
  listIssues(filters: IssueListFilters): Promise<IssueListResponse>;
  /** GET /issues/{id} (OFFICER). Evidence URLs are short-lived: refetch to refresh them. */
  getIssue(id: string): Promise<IssueDetailResponse>;
  /** POST /issues/{id}/work-orders (OFFICER). Same idempotencyKey + body replays the original. */
  createWorkOrder(issueId: string, body: CreateWorkOrderRequest): Promise<CreateWorkOrderResponse>;
  /** PATCH /work-orders/{id} (OFFICER). */
  updateWorkOrder(id: string, body: UpdateWorkOrderRequest): Promise<UpdateWorkOrderResponse>;
  /** GET /analytics/summary (OFFICER). */
  analyticsSummary(): Promise<AnalyticsSummaryResponse>;
  /** POST /work-orders/{id}/resolution-evidence, then PUT the image to the presigned URL. */
  addResolutionPhoto(workOrderId: string, input: ResolutionPhotoInput): Promise<void>;
}
