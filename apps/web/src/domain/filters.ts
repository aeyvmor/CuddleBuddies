import type { Issue, IssueFilters } from "../api/types";

export function filterIssues(issues: Issue[], f: IssueFilters): Issue[] {
  return issues.filter((i) => {
    if (f.severity && i.severity !== f.severity) return false;
    if (f.issue_type && i.issue_type !== f.issue_type) return false;
    if (f.area_name && i.area_name !== f.area_name) return false;
    if (f.work_order_status) {
      const s = i.work_order?.status ?? "NONE";
      if (s !== f.work_order_status) return false;
    }
    return true;
  });
}
