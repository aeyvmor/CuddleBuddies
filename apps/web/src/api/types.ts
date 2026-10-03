/**
 * Web API types.
 *
 * Every shape the shared contract defines comes from @astig/contracts (draft v0,
 * docs/api/contract-v0-proposal.md). Do not redefine those here.
 *
 * The types in the LOCAL section exist only because the contract has no shape for
 * them yet (there is no GET /issues list route). Each one is tagged [gap Gn],
 * matching the "Contract gaps" table in apps/web/README.md. Delete them once
 * the backend owner adds the equivalent to packages/contracts.
 */
import type {
  ErrorCode,
  ErrorResponse,
  Issue,
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

// ---------------------------------------------------------------- LOCAL (gaps)

/**
 * [gap G1] One row of the issue list (map + list). The contract defines no list
 * response. `issue` is the contract's Issue; the other fields are the minimum
 * the list needs without fetching every issue detail.
 */
export interface IssueListItem {
  issue: Issue;
  /** [gap G2] Highest severityEstimate across the issue's completed detections; null if none. Issue has no severity field. */
  severity: SeverityEstimate | null;
  /** [gap G1] totalScore of the latest risk assessment; null if not scored yet. */
  totalScore: number | null;
  /** [gap G1] Status of the newest work order; null if the issue has none. */
  workOrderStatus: WorkOrderStatus | null;
}

/** [gap G1] Query filters for the issue list. Field names follow contract casing. */
export interface IssueListFilters {
  severity?: SeverityEstimate;
  issueType?: IssueType;
  areaName?: string;
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
