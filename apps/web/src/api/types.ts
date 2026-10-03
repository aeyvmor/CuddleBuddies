/**
 * Web API types.
 *
 * Every shape the shared contract defines comes from @astig/contracts (draft v0,
 * docs/api/contract-v0-proposal.md). Do not redefine those here.
 *
 * The LOCAL section holds only what the web needs that the contract does not shape
 * for it: the filter subset of IssueListQuery and an Error subclass for the envelope.
 */
import type {
  ErrorCode,
  ErrorResponse,
  IssueStatus,
  IssueType,
  SeverityEstimate,
  WorkOrderStatus,
} from "@astig/contracts";

export type {
  CreateWorkOrderRequest,
  CreateWorkOrderResponse,
  Detection,
  ErrorCode,
  EvidenceAccess,
  Issue,
  IssueDetailResponse,
  IssueObservation,
  IssueStatus,
  IssueType,
  ProcessingStatus,
  Role,
  SamplingMethod,
  ScoreBreakdown,
  ScoreComponent,
  SeverityEstimate,
  UpdateWorkOrderRequest,
  UpdateWorkOrderResponse,
  WorkOrder,
  WorkOrderStatus,
} from "@astig/contracts";

// ---------------------------------------------------------------- LOCAL

/**
 * One row of the issue list (map + list): the contract's IssueListItem (GET /issues).
 * The mock builds the same shape; the HTTP client (backend owner) will return it.
 */
export type { IssueListItem } from "@astig/contracts";

/**
 * Filters the UI can set. Names and values follow the contract's IssueListQuery; it is
 * kept local because that query type also carries paging (limit, cursor) and bbox,
 * which the HTTP client adds.
 */
export interface IssueListFilters {
  severity?: SeverityEstimate;
  /** The contract's list query excludes NONE. */
  issueType?: Exclude<IssueType, "NONE">;
  areaName?: string;
  status?: IssueStatus;
  /** NONE = issues with no work order. */
  workOrderStatus?: WorkOrderStatus | "NONE";
}

/** Client-side error carrying the contract's error envelope fields. */
export class ApiError extends Error {
  readonly code: ErrorCode;
  readonly requestId: string;
  constructor(body: ErrorResponse["error"]) {
    super(body.message);
    this.name = "ApiError";
    this.code = body.code;
    this.requestId = body.requestId;
  }
}
