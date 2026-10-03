import type { Detection, IssueType } from "@astig/contracts";

/**
 * Conservative v0 issue association: a validated detection joins the nearest OPEN issue of the
 * SAME type within this radius; otherwise it starts a new issue. Proximity alone can merge
 * adjacent assets, so the radius is small and every observation stays independently available.
 */
export const ISSUE_MATCH_RADIUS_M = 25;

/** Only visible infrastructure with a concrete issue type becomes (part of) an operational issue. */
export function issueTypeForDetection(d: Detection): Exclude<IssueType, "NONE"> | null {
  if (!d.infrastructureVisible || d.issueType === "NONE") return null;
  return d.issueType;
}
