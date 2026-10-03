/**
 * PROVISIONAL client-side API types.
 *
 * The API contract is not frozen and packages/contracts is empty. Only the
 * Detection field names (contract.md "Detection output minimum"), the work-order
 * states (requirements.md item 11) and the processing statuses (contract.md
 * "API behavior") are taken from the docs. Every other name and shape here was
 * chosen by the web client, whether or not it carries a [PROVISIONAL] marker.
 * Line-by-line review: docs/api/client-contract-proposal.md. When
 * packages/contracts lands, delete this file and import from the shared package.
 */

/** [PROVISIONAL] enum values; contract.md says "Restrict enums" but lists no severity values. */
export type Severity = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

/** [PROVISIONAL] enum values; contract.md names issue_type but lists no values. */
export type IssueType = "BLOCKED_DRAIN" | "STANDING_WATER" | "DEBRIS" | "DAMAGED_ROAD";

/** Required by requirements.md item 11. */
export type WorkOrderStatus = "OPEN" | "IN_PROGRESS" | "RESOLVED";

/** docs/api/contract.md: "PENDING, PROCESSING, COMPLETED, FAILED or an agreed equivalent". */
export type ProcessingStatus = "PENDING" | "PROCESSING" | "COMPLETED" | "FAILED";

/** Detection output minimum, docs/api/contract.md. */
export interface Detection {
  infrastructure_visible: boolean;
  issue_type: IssueType;
  /** [PROVISIONAL] free-form in this client; contract lists the field but no values. */
  obstruction_type: string;
  blockage_percent: number | null;
  severity_estimate: Severity;
  /** 0..1 */
  confidence: number;
  evidence_description: string;
  requires_human_review: boolean;
  model_version: string;
  schema_version: string;
}

/** [PROVISIONAL] read shape; contract.md lists capture concepts but not response field names. */
export interface Observation {
  id: string;
  /** UTC ISO-8601 instant. */
  captured_at: string;
  latitude: number;
  longitude: number;
  /** [PROVISIONAL] name. Available horizontal accuracy in metres; null when the device gave none. */
  horizontal_accuracy_m: number | null;
  processing_status: ProcessingStatus;
  /** [PROVISIONAL] stable machine code when processing_status is FAILED. */
  error_code: string | null;
  /** [PROVISIONAL] Short-lived authorised URL, or null (not yet processed / synthetic / expired). Issuance and expiry are undefined. */
  image_url: string | null;
  /** Present only when processing_status is COMPLETED. */
  detection: Detection | null;
}

/** [PROVISIONAL] names mirror requirements.md item 8 factor list ("population/road exposure" -> exposure). */
export type ScoreFactor = "severity" | "weather" | "recurrence" | "hazard" | "exposure";

/** [PROVISIONAL] whole shape; design.md requires persisted components and missing-vs-zero distinction but defines no fields. */
export interface ScoreComponent {
  factor: ScoreFactor;
  /** UNAVAILABLE means the input was not obtained; it is NOT zero risk. */
  status: "MEASURED" | "UNAVAILABLE";
  /** Weighted points already capped; null when UNAVAILABLE. */
  points: number | null;
  /** Maximum points this component can contribute. */
  cap: number;
}

/** [PROVISIONAL] shape; only formula_version is named in design.md. */
export interface RiskAssessment {
  /** 0..100 */
  total: number;
  formula_version: string;
  components: ScoreComponent[];
}

/** [PROVISIONAL] fields; only the status values come from requirements.md. */
export interface WorkOrder {
  id: string;
  issue_id: string;
  status: WorkOrderStatus;
  assignee: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

/** [PROVISIONAL] shape. Has no issue-level status distinct from work_order (see proposal). */
export interface Issue {
  id: string;
  issue_type: IssueType;
  severity: Severity;
  latitude: number;
  longitude: number;
  /** [PROVISIONAL] administrative area, null when geodata could not match one. */
  area_name: string | null;
  /** [PROVISIONAL] metres; GPS uncertainty must not be shown as exact asset location. */
  location_uncertainty_m: number | null;
  /** [PROVISIONAL] true for seeded/synthetic records. */
  is_synthetic: boolean;
  observation_count: number;
  risk: RiskAssessment;
  /** [PROVISIONAL] advisory text; never an instruction to dispatch. */
  recommendation: string;
  work_order: WorkOrder | null;
}

export interface IssueDetail extends Issue {
  observations: Observation[];
}

/** [PROVISIONAL] query parameters; no pagination yet although contract.md requires it. */
export interface IssueFilters {
  severity?: Severity;
  issue_type?: IssueType;
  area_name?: string;
  /** Work-order state, or NONE for issues with no work order. */
  work_order_status?: WorkOrderStatus | "NONE";
}

/** [PROVISIONAL] contract.md requires a stable code and safe message; the wrapper and code list are not defined. */
export interface ApiErrorBody {
  code: string;
  message: string;
}

export class ApiError extends Error {
  readonly code: string;
  constructor(body: ApiErrorBody) {
    super(body.message);
    this.name = "ApiError";
    this.code = body.code;
  }
}

/** [PROVISIONAL] demo role model; real auth is undecided. */
export type ActorRole = "VIEWER" | "OFFICER";
