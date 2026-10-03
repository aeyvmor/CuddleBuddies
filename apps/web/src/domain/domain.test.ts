import { describe, expect, it } from "vitest";
import { filterIssues } from "./filters";
import { isValidTransition, nextWorkOrderStatus } from "./workOrder";
import { projectPoints } from "./projection";
import { createSyntheticIssues } from "../data/syntheticData";

describe("filterIssues", () => {
  const issues = createSyntheticIssues();

  it("returns everything with no filters", () => {
    expect(filterIssues(issues, {})).toHaveLength(issues.length);
  });

  it("filters by severity, type and area together", () => {
    const r = filterIssues(issues, { severity: "HIGH", issue_type: "BLOCKED_DRAIN", area_name: "Demo Zone A" });
    expect(r.map((i) => i.id)).toEqual(["SYN-ISSUE-001"]);
  });

  it("filters issues without a work order via NONE", () => {
    const r = filterIssues(issues, { work_order_status: "NONE" });
    expect(r.map((i) => i.id)).toEqual(["SYN-ISSUE-001", "SYN-ISSUE-003"]);
  });

  it("filters by work order status", () => {
    expect(filterIssues(issues, { work_order_status: "RESOLVED" }).map((i) => i.id)).toEqual(["SYN-ISSUE-004"]);
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
