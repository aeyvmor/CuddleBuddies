import {
  CreateWorkOrderRequest,
  CreateWorkOrderResponse,
  IssueDetailResponse,
  UpdateWorkOrderRequest,
  UpdateWorkOrderResponse,
  type ErrorCode,
  type Role,
  type WorkOrder,
} from "@astig/contracts";
import type { ApiClient } from "./client";
import { filterIssues, highestSeverity } from "../domain/filters";
import { isValidTransition } from "../domain/workOrder";
import { createSyntheticIssues } from "../data/syntheticData";
import { ApiError, type IssueListItem } from "./types";

/** Minimal view of a Zod schema, so the web does not depend on zod directly. */
interface Schema<T> {
  safeParse(value: unknown): { success: true; data: T } | { success: false; error: { issues: { path: PropertyKey[]; message: string }[] } };
}

/**
 * In-memory stand-in for the API. It follows the server rules documented in
 * docs/api/contract-v0-proposal.md and services/api (OFFICER-only routes,
 * idempotent create, ISSUE_NOT_OPEN, ACTIVE_WORK_ORDER_EXISTS,
 * RISK_ASSESSMENT_MISMATCH, INVALID_TRANSITION, WORK_ORDER_CLOSED), validates
 * requests with the shared Zod schemas, and checks its own responses against
 * them, so contract drift fails loudly instead of rendering wrong data.
 */
export function createMockApi(options: {
  getRole: () => Role;
  seed?: IssueDetailResponse[];
  now?: () => Date;
  subject?: string;
}): ApiClient {
  const details = options.seed ?? createSyntheticIssues();
  const now = options.now ?? (() => new Date());
  const subject = options.subject ?? "demo-officer";
  /** key: `${issueId}:${idempotencyKey}` -> request JSON + work order id */
  const idempotency = new Map<string, { body: string; workOrderId: string }>();
  let seq = 0;
  let req = 0;

  const fail = (code: ErrorCode, message: string): never => {
    throw new ApiError({ code, message, requestId: `mock-${++req}` });
  };
  const requireOfficer = () => {
    if (options.getRole() !== "OFFICER") fail("FORBIDDEN", "Requires role OFFICER.");
  };
  const findDetail = (issueId: string) => details.find((d) => d.issue.id === issueId) ?? fail("NOT_FOUND", "Issue not found.");
  const parseRequest = <T,>(schema: Schema<T>, body: unknown): T => {
    const r = schema.safeParse(body);
    if (!r.success) return fail("VALIDATION_FAILED", `Invalid request: ${r.error.issues[0]?.path.join(".") || "body"}.`);
    return r.data;
  };
  const respond = <T,>(schema: Schema<T>, body: unknown): T => {
    const r = schema.safeParse(body);
    if (!r.success) throw new Error(`mock response violates contract: ${r.error.issues[0]?.path.join(".")} ${r.error.issues[0]?.message}`);
    return structuredClone(r.data);
  };
  const newId = () => `5e000000-0000-4000-8000-9999${String(++seq).padStart(8, "0")}`;

  const listItem = (d: IssueDetailResponse): IssueListItem => ({
    issue: structuredClone(d.issue),
    severity: highestSeverity(d.observations),
    totalScore: d.riskAssessment?.totalScore ?? null,
    workOrderStatus: d.workOrders[0]?.status ?? null,
  });

  return {
    async listIssues(filters) {
      // [gap G1] No list route or role rule yet; readable by any demo role here.
      return filterIssues(details.map(listItem), filters);
    },

    async getIssue(issueId) {
      requireOfficer();
      return respond(IssueDetailResponse, findDetail(issueId));
    },

    async createWorkOrder(issueId, rawBody) {
      requireOfficer();
      const body = parseRequest(CreateWorkOrderRequest, rawBody);
      const detail = findDetail(issueId);

      const key = `${issueId}:${body.idempotencyKey}`;
      const bodyJson = JSON.stringify(body);
      const prior = idempotency.get(key);
      if (prior) {
        if (prior.body !== bodyJson) fail("IDEMPOTENCY_CONFLICT", "idempotencyKey was already used with a different request.");
        const original = detail.workOrders.find((w) => w.id === prior.workOrderId)!;
        return respond(CreateWorkOrderResponse, { created: false, workOrder: original });
      }
      if (detail.issue.status !== "OPEN") fail("ISSUE_NOT_OPEN", "Work orders can only be created for OPEN issues.");
      if (detail.riskAssessment?.id !== body.riskAssessmentId) {
        fail("RISK_ASSESSMENT_MISMATCH", "riskAssessmentId does not belong to this issue.");
      }
      if (detail.workOrders.some((w) => w.status !== "RESOLVED")) {
        fail("ACTIVE_WORK_ORDER_EXISTS", "This issue already has an active work order.");
      }

      const ts = now().toISOString();
      const wo: WorkOrder = {
        id: newId(),
        issueId,
        riskAssessmentId: body.riskAssessmentId,
        status: "OPEN",
        assignedTeam: body.assignedTeam ?? null,
        notes: body.notes ?? null,
        createdBySubject: subject,
        createdAt: ts,
        updatedAt: ts,
        startedAt: null,
        resolvedAt: null,
        version: 1,
      };
      detail.workOrders.unshift(wo);
      idempotency.set(key, { body: bodyJson, workOrderId: wo.id });
      return respond(CreateWorkOrderResponse, { created: true, workOrder: wo });
    },

    async updateWorkOrder(workOrderId, rawBody) {
      requireOfficer();
      const body = parseRequest(UpdateWorkOrderRequest, rawBody);
      const detail = details.find((d) => d.workOrders.some((w) => w.id === workOrderId));
      const wo = detail?.workOrders.find((w) => w.id === workOrderId) ?? fail("NOT_FOUND", "Work order not found.");
      if (wo.status === "RESOLVED") fail("WORK_ORDER_CLOSED", "This work order is resolved and can no longer be changed.");

      const ts = now().toISOString();
      if (body.status !== undefined && body.status !== wo.status) {
        if (!isValidTransition(wo.status, body.status)) {
          fail("INVALID_TRANSITION", `Cannot move a work order from ${wo.status} to ${body.status}.`);
        }
        wo.status = body.status;
        if (body.status === "IN_PROGRESS") wo.startedAt = ts;
        if (body.status === "RESOLVED") {
          wo.resolvedAt = ts;
          detail!.issue.status = "RESOLVED";
        }
      }
      if (body.assignedTeam !== undefined) wo.assignedTeam = body.assignedTeam;
      if (body.notes !== undefined) wo.notes = body.notes;
      wo.updatedAt = ts;
      wo.version += 1;
      return respond(UpdateWorkOrderResponse, { workOrder: wo });
    },
  };
}
