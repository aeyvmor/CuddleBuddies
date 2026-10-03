/**
 * PROVISIONAL client-side API types.
 *
 * The API contract is not frozen and packages/contracts is empty. Field names
 * follow docs/api/contract.md where it names them (detection output, capture
 * metadata). Everything marked [PROVISIONAL] is a proposal for the backend owner
 * to confirm or replace. When packages/contracts lands, delete this file and
 * import from the shared package; see apps/web/README.md "Contract gaps".
 */

/** [PROVISIONAL] enum values; contract requires a restricted enum but lists none. */
export type Severity = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

/** [PROVISIONAL] */
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

export interface Observation {
  id: string;
  /** UTC ISO-8601 instant. */
  captured_at: string;
  latitude: number;
  longitude: number;
  /** Available horizontal accuracy in metres; null when the device gave none. */
  horizontal_accuracy_m: number | null;
  processing_status: ProcessingStatus;
  /** [PROVISIONAL] stable machine code when processing_status is FAILED. */
  error_code: string | null;
  /** Short-lived authorised URL, or null (not yet processed / synthetic / expired). */
  image_url: string | null;
  /** Present only when processing_status is COMPLETED. */
  detection: Detection | null;
}

/** [PROVISIONAL] names mirror requirements.md item 8 factor list. */
export type ScoreFactor = "severity" | "weather" | "recurrence" | "hazard" | "exposure";

export interface ScoreComponent {
  factor: ScoreFactor;
  /** UNAVAILABLE means the input was not obtained; it is NOT zero risk. */
  status: "MEASURED" | "UNAVAILABLE";
  /** Weighted points already capped; null when UNAVAILABLE. */
  points: number | null;
  /** Maximum points this component can contribute. */
  cap: number;
}

export interface RiskAssessment {
  /** 0..100 */
  total: number;
  formula_version: string;
  components: ScoreComponent[];
}

export interface WorkOrder {
  id: string;
  issue_id: string;
  status: WorkOrderStatus;
  assignee: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

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

export interface IssueFilters {
  severity?: Severity;
  issue_type?: IssueType;
  area_name?: string;
  /** Work-order state, or NONE for issues with no work order. */
  work_order_status?: WorkOrderStatus | "NONE";
}

/** docs/api/contract.md: consistent envelope with stable code and safe message. */
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
