import { describe, expect, it } from "vitest";
import { IssueDetailResponse } from "@astig/contracts";
import { filterIssues, highestSeverity } from "./filters";
import { isValidTransition, nextWorkOrderStatus } from "./workOrder";
import { projectPoints } from "./projection";
import { createSyntheticIssues, SYNTHETIC_ISSUE_IDS } from "../data/syntheticData";
import type { IssueListItem } from "../api/types";

const details = createSyntheticIssues();
const items: IssueListItem[] = details.map((d) => ({
  issue: d.issue,
  severity: highestSeverity(d.observations),
  totalScore: d.riskAssessment?.totalScore ?? null,
  workOrderStatus: d.workOrders[0]?.status ?? null,
}));
const [I1, I2, I3, I4] = SYNTHETIC_ISSUE_IDS;

describe("synthetic data", () => {
  it("conforms to the shared IssueDetailResponse contract", () => {
    for (const d of details) {
      const r = IssueDetailResponse.safeParse(d);
      expect(r.success, r.success ? "" : JSON.stringify(r.error.issues[0])).toBe(true);
    }
  });

  it("is labelled synthetic at issue and observation level", () => {
    for (const d of details) {
      expect(d.issue.isSynthetic).toBe(true);
      for (const o of d.observations) expect(o.isSynthetic).toBe(true);
    }
  });
});

describe("filterIssues", () => {
  it("returns everything with no filters", () => {
    expect(filterIssues(items, {})).toHaveLength(items.length);
  });

  it("filters by severity, type and area together", () => {
    const r = filterIssues(items, { severity: "HIGH", issueType: "BLOCKED_DRAIN", areaName: "Demo Zone A" });
    expect(r.map((i) => i.issue.id)).toEqual([I1]);
  });

  it("filters issues without a work order via NONE", () => {
    expect(filterIssues(items, { workOrderStatus: "NONE" }).map((i) => i.issue.id)).toEqual([I1, I3]);
  });

  it("filters by work order status", () => {
    expect(filterIssues(items, { workOrderStatus: "RESOLVED" }).map((i) => i.issue.id)).toEqual([I4]);
    expect(filterIssues(items, { workOrderStatus: "IN_PROGRESS" }).map((i) => i.issue.id)).toEqual([I2]);
  });
});

describe("highestSeverity", () => {
  it("takes the highest estimate and ignores failed observations", () => {
    expect(highestSeverity(details[0]!.observations)).toBe("HIGH");
  });

  it("is null when nothing was detected", () => {
    expect(highestSeverity([])).toBeNull();
  });
});

describe("work order transitions", () => {
  it("only allows OPEN -> IN_PROGRESS -> RESOLVED", () => {
    expect(isValidTransition("OPEN", "IN_PROGRESS")).toBe(true);
    expect(isValidTransition("IN_PROGRESS", "RESOLVED")).toBe(true);
    expect(isValidTransition("OPEN", "RESOLVED")).toBe(false);
    expect(isValidTransition("RESOLVED", "OPEN")).toBe(false);
    expect(isValidTransition("IN_PROGRESS", "OPEN")).toBe(false);
  });

  it("offers no step after RESOLVED", () => {
    expect(nextWorkOrderStatus("RESOLVED")).toBeNull();
  });
});

describe("projectPoints", () => {
  it("returns nothing for no points", () => {
    expect(projectPoints([])).toEqual([]);
  });

  it("centres a single point", () => {
    expect(projectPoints([{ latitude: 1, longitude: 2 }])).toEqual([{ x: 50, y: 50 }]);
  });

  it("maps north to the top and east to the right within padding", () => {
    const [sw, ne] = projectPoints([
      { latitude: 0, longitude: 0 },
      { latitude: 1, longitude: 1 },
    ]);
    expect(sw).toEqual({ x: 10, y: 90 });
    expect(ne).toEqual({ x: 90, y: 10 });
  });
});
