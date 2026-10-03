import type { IssueListFilters, IssueListItem, IssueObservation, SeverityEstimate } from "../api/types";

export function filterIssues(items: IssueListItem[], f: IssueListFilters): IssueListItem[] {
  return items.filter((i) => {
    if (f.severity && i.severity !== f.severity) return false;
    if (f.issueType && i.issue.issueType !== f.issueType) return false;
    if (f.areaName && i.issue.areaName !== f.areaName) return false;
    if (f.workOrderStatus && (i.workOrderStatus ?? "NONE") !== f.workOrderStatus) return false;
    return true;
  });
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
