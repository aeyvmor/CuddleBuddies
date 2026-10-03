import { AstigApiError, type AstigClient, type ListIssuesParams } from "@astig/api-client";
import type { ApiClient } from "./client";
import { ApiError, type IssueListFilters, type IssueListItem, type IssueListResponse } from "./types";

/** GET /issues returns at most 200 per page; the queue and Previous/Next need the whole list. */
export const LIST_PAGE_LIMIT = 200;
/** Safety cap: stop after this many pages (2,000 issues) and report that more exist (nextCursor). */
export const LIST_MAX_PAGES = 10;

/** The subset of AstigClient this adapter uses (a real AstigClient in the app; tests pass one with a fake fetch). */
type Transport = Pick<
  AstigClient,
  "listIssues" | "getIssue" | "createWorkOrder" | "updateWorkOrder" | "analyticsSummary" | "createResolutionEvidence" | "uploadImage"
>;

export const FORBIDDEN_TEXT = "This account can't access the dashboard (needs OFFICER).";
export const SIGNED_OUT_TEXT = "Your session has ended. Please sign in again.";

/**
 * Converts the client's error into the UI's ApiError. Sign-in problems also tell the
 * auth gate to return to the sign-in screen; nothing is retried or hidden here.
 */
function toApiError(e: unknown, onAuthLost: () => void): ApiError {
  if (e instanceof ApiError) return e;
  if (e instanceof AstigApiError) {
    if (e.code === "AUTH_REQUIRED" || e.code === "UNAUTHENTICATED") {
      onAuthLost();
      return new ApiError({ code: e.code, message: SIGNED_OUT_TEXT, requestId: e.requestId, status: e.status });
    }
    const message = e.code === "FORBIDDEN" ? FORBIDDEN_TEXT : e.message;
    return new ApiError({ code: e.code, message, requestId: e.requestId, status: e.status, details: e.details });
  }
  return new ApiError({ code: "UNEXPECTED_RESPONSE", message: e instanceof Error ? e.message : "Unexpected error." });
}

function toParams(f: IssueListFilters): ListIssuesParams {
  const p: ListIssuesParams = { limit: LIST_PAGE_LIMIT };
  if (f.severity) p.severity = f.severity;
  if (f.issueType) p.issueType = f.issueType;
  if (f.areaName) p.areaName = f.areaName;
  if (f.status) p.status = f.status;
  if (f.workOrderStatus) p.workOrderStatus = f.workOrderStatus;
  return p;
}

/** HTTP implementation of the UI's ApiClient over @astig/api-client (live backend). */
export function createHttpApi(opts: { client: Transport; onAuthLost: () => void }): ApiClient {
  const { client, onAuthLost } = opts;
  const call = async <T,>(fn: () => Promise<T>): Promise<T> => {
    try {
      return await fn();
    } catch (e) {
      throw toApiError(e, onAuthLost);
    }
  };

  return {
    listIssues: (filters) =>
      call(async (): Promise<IssueListResponse> => {
        const params = toParams(filters);
        const items: IssueListItem[] = [];
        let areaNames: string[] = [];
        let cursor: string | null = null;
        for (let page = 0; page < LIST_MAX_PAGES; page++) {
          const res: IssueListResponse = await client.listIssues(cursor ? { ...params, cursor } : params);
          items.push(...res.items);
          if (page === 0) areaNames = res.areaNames;
          cursor = res.nextCursor;
          if (!cursor) break;
        }
        return { items, nextCursor: cursor, areaNames };
      }),
    getIssue: (id) => call(() => client.getIssue(id)),
    createWorkOrder: (issueId, body) => call(() => client.createWorkOrder(issueId, body)),
    updateWorkOrder: (id, body) => call(() => client.updateWorkOrder(id, body)),
    analyticsSummary: () => call(() => client.analyticsSummary()),
    addResolutionPhoto: (workOrderId, input) =>
      call(async () => {
        const ev = await client.createResolutionEvidence(workOrderId, {
          clientEvidenceId: input.clientEvidenceId,
          contentType: "image/jpeg",
          contentLengthBytes: input.file.size,
          ...(input.note ? { note: input.note } : {}),
        });
        // Null upload: this clientEvidenceId was already uploaded (a retry of a finished action).
        if (ev.upload) await client.uploadImage(ev.upload, input.file);
      }),
  };
}
