import type { IssueListFilters, IssueListItem, IssueObservation, SeverityEstimate } from "../api/types";

export function filterIssues(items: IssueListItem[], f: IssueListFilters): IssueListItem[] {
  return items.filter((i) => {
    if (f.severity && i.severity !== f.severity) return false;
    if (f.issueType && i.issue.issueType !== f.issueType) return false;
    if (f.areaName && i.issue.areaName !== f.areaName) return false;
    if (f.status && i.issue.status !== f.status) return false;
    if (f.workOrderStatus && (i.workOrderStatus ?? "NONE") !== f.workOrderStatus) return false;
    return true;
  });
}

/** How many filters are set (for the "Clear filters" control). */
export function activeFilterCount(f: IssueListFilters): number {
  return Object.values(f).filter((v) => v !== undefined && v !== "").length;
}

/**
 * Queue order, as the contract specifies for GET /issues: totalScore descending with
 * unscored issues last, then lastObservedAt descending, then id. Previous/Next in the
 * detail panel follows the same order.
 */
export function byPriority(a: IssueListItem, b: IssueListItem): number {
  const sa = a.totalScore ?? -1;
  const sb = b.totalScore ?? -1;
  if (sa !== sb) return sb - sa;
  if (a.issue.lastObservedAt !== b.issue.lastObservedAt) return a.issue.lastObservedAt < b.issue.lastObservedAt ? 1 : -1;
  return a.issue.id < b.issue.id ? -1 : a.issue.id > b.issue.id ? 1 : 0;
}

export function sortByPriority(items: IssueListItem[]): IssueListItem[] {
  return [...items].sort(byPriority);
}

const SEVERITY_RANK: Record<SeverityEstimate, number> = { NONE: 0, LOW: 1, MODERATE: 2, HIGH: 3, CRITICAL: 4 };

/**
 * [gap G2] The contract's Issue has no severity. Until it does, the list and the
 * detail header show the highest AI severity estimate among completed detections.
 * Null when no observation has a detection.
 */
export function highestSeverity(observations: IssueObservation[]): SeverityEstimate | null {
  let best: SeverityEstimate | null = null;
  for (const o of observations) {
    const s = o.detection?.severityEstimate;
    if (s && (best === null || SEVERITY_RANK[s] > SEVERITY_RANK[best])) best = s;
  }
  return best;
}
