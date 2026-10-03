import { AstigApiError, AstigClient, type ListIssuesParams } from "@astig/api-client";
import type { ApiClient } from "./client";
import { ApiError, type IssueListFilters, type IssueListItem } from "./types";

/** Hard stop so a runaway cursor loop can never hang the UI. */
const MAX_PAGES = 10;

/** Converts the shared client's error into the web's ApiError so existing UI messages work. */
function toWebError(e: unknown): unknown {
  if (e instanceof AstigApiError) {
    const code = (e.code === "NETWORK_ERROR" || e.code === "UNEXPECTED_RESPONSE" ? "SERVICE_UNAVAILABLE" : e.code === "AUTH_REQUIRED" ? "UNAUTHENTICATED" : e.code) as ApiError["code"];
    return new ApiError({ code, message: e.message, requestId: e.requestId ?? "client" });
  }
  return e;
}

const wrap = async <T>(p: Promise<T>): Promise<T> => {
  try {
    return await p;
  } catch (e) {
    throw toWebError(e);
  }
};

/**
 * HTTP implementation of the web ApiClient, backed by @astig/api-client (live backend).
 * listIssues follows the cursor so the UI keeps receiving a full array, as with the mock.
 */
export function createHttpApi(client: AstigClient): ApiClient {
  return {
    async listIssues(filters: IssueListFilters): Promise<IssueListItem[]> {
      const items: IssueListItem[] = [];
      let cursor: string | undefined;
      for (let page = 0; page < MAX_PAGES; page++) {
        const params: ListIssuesParams = { ...filters, limit: 200, ...(cursor ? { cursor } : {}) };
        const res = await wrap(client.listIssues(params));
        items.push(...res.items);
        if (!res.nextCursor) break;
        cursor = res.nextCursor;
      }
      return items;
    },
    getIssue: (id) => wrap(client.getIssue(id)),
    createWorkOrder: (issueId, body) => wrap(client.createWorkOrder(issueId, body)),
    updateWorkOrder: (id, body) => wrap(client.updateWorkOrder(id, body)),
  };
}
