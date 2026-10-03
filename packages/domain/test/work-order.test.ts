import { describe, expect, it } from "vitest";
import { WorkOrderStatus } from "@astig/contracts";
import { decideWorkOrderTransition, isTerminalWorkOrderStatus } from "../src";

describe("work-order transitions", () => {
  it("allows OPEN → IN_PROGRESS → RESOLVED", () => {
    expect(decideWorkOrderTransition("OPEN", "IN_PROGRESS").kind).toBe("TRANSITION");
    expect(decideWorkOrderTransition("IN_PROGRESS", "RESOLVED").kind).toBe("TRANSITION");
  });

  it.each([
    ["OPEN", "RESOLVED"],
    ["IN_PROGRESS", "OPEN"],
    ["RESOLVED", "OPEN"],
    ["RESOLVED", "IN_PROGRESS"],
  ] as const)("rejects %s → %s", (from, to) => {
    const d = decideWorkOrderTransition(from, to);
    expect(d.kind).toBe("INVALID");
  });

  it("treats same-status as an idempotent no-op", () => {
    for (const s of WorkOrderStatus.options) expect(decideWorkOrderTransition(s, s).kind).toBe("NOOP");
  });

  it("only RESOLVED is terminal", () => {
    expect(isTerminalWorkOrderStatus("RESOLVED")).toBe(true);
    expect(isTerminalWorkOrderStatus("OPEN")).toBe(false);
    expect(isTerminalWorkOrderStatus("IN_PROGRESS")).toBe(false);
  });
});
