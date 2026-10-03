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
  IssueDetailResponse,
  IssueStatus,
  IssueType,
  SeverityEstimate,
  WorkOrderStatus,
} from "@astig/contracts";

export type {
  AnalyticsSummaryResponse,
  CreateWorkOrderRequest,
  CreateWorkOrderResponse,
  Detection,
  ErrorCode,
  EvidenceAccess,
  Issue,
  IssueDetailResponse,
  IssueListItem,
  IssueListResponse,
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

/** One entry of IssueDetailResponse.resolutionEvidence (the field is optional in the contract). */
export type ResolutionEvidenceItem = NonNullable<IssueDetailResponse["resolutionEvidence"]>[number];

// ---------------------------------------------------------------- LOCAL

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

/** Codes the client itself can raise (not sent by the API). */
export type ClientErrorCode = "NETWORK_ERROR" | "AUTH_REQUIRED" | "UNEXPECTED_RESPONSE";

/**
 * Error shown by the UI: the API's error envelope (stable code, safe message, requestId),
 * or a client-side failure. Both the mock and the HTTP client throw this type.
 */
export class ApiError extends Error {
  readonly code: ErrorCode | ClientErrorCode;
  /** The API's requestId, for reports; null for client-side failures. */
  readonly requestId: string | null;
  /** HTTP status; 0 for network failures; null when not applicable (mock). */
  readonly status: number | null;
  readonly details: { path: string; message: string }[];
  constructor(body: {
    code: ErrorCode | ClientErrorCode;
    message: string;
    requestId?: string | null;
    status?: number | null;
    details?: { path: string; message: string }[];
  }) {
    super(body.message);
    this.name = "ApiError";
    this.code = body.code;
    this.requestId = body.requestId ?? null;
    this.status = body.status ?? null;
    this.details = body.details ?? [];
  }

  /** A 409-class business rule (the issue changed; refetch and show the message). */
  get isConflict(): boolean {
    return ["INVALID_TRANSITION", "WORK_ORDER_CLOSED", "ISSUE_NOT_OPEN", "ACTIVE_WORK_ORDER_EXISTS", "RISK_ASSESSMENT_MISMATCH"].includes(this.code);
  }
}

/** User-facing text for an error: the safe message, plus the requestId to quote in a report. */
export function errorText(e: unknown, fallback: string): string {
  if (!(e instanceof ApiError)) return fallback;
  const details = e.details.length > 0 ? ` (${e.details.map((d) => `${d.path}: ${d.message}`).join("; ")})` : "";
  return `${e.message}${details}`;
}
