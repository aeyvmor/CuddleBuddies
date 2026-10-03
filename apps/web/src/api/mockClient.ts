import type { ApiClient } from "./client";
import { filterIssues } from "../domain/filters";
import { isValidTransition } from "../domain/workOrder";
import { createSyntheticIssues } from "../data/syntheticData";
import { ApiError, type ActorRole, type Issue, type IssueDetail, type WorkOrder } from "./types";

/**
 * In-memory stand-in for the API while the contract is unfrozen. It mimics the
 * server behaviours the UI must handle: officer-only writes, duplicate work
 * orders, and rejected transitions, each as a stable ApiError code.
 */
export function createMockApi(options: {
  getRole: () => ActorRole;
  seed?: IssueDetail[];
  now?: () => Date;
}): ApiClient {
  const issues = options.seed ?? createSyntheticIssues();
  const now = options.now ?? (() => new Date());
  let counter = 100;

  const requireOfficer = () => {
    if (options.getRole() !== "OFFICER") {
      throw new ApiError({ code: "FORBIDDEN", message: "Only an authorized officer can do this." });
    }
  };
  const find = (id: string) => {
    const issue = issues.find((i) => i.id === id);
    if (!issue) throw new ApiError({ code: "NOT_FOUND", message: "Issue not found." });
    return issue;
  };
  const summary = (i: IssueDetail): Issue => {
    const { observations: _observations, ...rest } = i;
    return rest;
  };

  return {
    async listIssues(filters) {
      return filterIssues(issues.map(summary), filters);
    },
    async getIssue(id) {
      return structuredClone(find(id));
    },
    async createWorkOrder(issueId, input) {
      requireOfficer();
      const issue = find(issueId);
      if (issue.work_order) {
        throw new ApiError({ code: "WORK_ORDER_EXISTS", message: "This issue already has a work order." });
      }
      const ts = now().toISOString();
      const wo: WorkOrder = {
        id: `SYN-WO-${++counter}`,
        issue_id: issueId,
        status: "OPEN",
        assignee: input.assignee,
        notes: input.notes,
        created_at: ts,
        updated_at: ts,
      };
      issue.work_order = wo;
      return structuredClone(wo);
    },
    async updateWorkOrder(id, patch) {
      requireOfficer();
      const issue = issues.find((i) => i.work_order?.id === id);
      const wo = issue?.work_order;
      if (!wo) throw new ApiError({ code: "NOT_FOUND", message: "Work order not found." });
      if (patch.status !== undefined && patch.status !== wo.status) {
        if (!isValidTransition(wo.status, patch.status)) {
          throw new ApiError({
            code: "INVALID_TRANSITION",
            message: `Cannot move a work order from ${wo.status} to ${patch.status}.`,
          });
        }
        wo.status = patch.status;
      }
      if (patch.assignee !== undefined) wo.assignee = patch.assignee;
      if (patch.notes !== undefined) wo.notes = patch.notes;
      wo.updated_at = now().toISOString();
      return structuredClone(wo);
    },
  };
}
