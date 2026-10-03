import { describe, expect, it } from "vitest";
import { createMockApi } from "./mockClient";
import { ApiError, type Role } from "./types";
import { SYNTHETIC_ISSUE_IDS } from "../data/syntheticData";

const [I1, I2, I3, I4] = SYNTHETIC_ISSUE_IDS as [string, string, string, string];
const KEY_A = "11111111-1111-4111-8111-111111111111";
const KEY_B = "22222222-2222-4222-8222-222222222222";

function api(role: Role = "OFFICER") {
  return createMockApi({ getRole: () => role });
}

async function riskId(a: ReturnType<typeof api>, issueId: string) {
  return (await a.getIssue(issueId)).riskAssessment!.id;
}

async function code(p: Promise<unknown>) {
  const e = await p.then(() => null, (err: unknown) => err);
  expect(e).toBeInstanceOf(ApiError);
  return (e as ApiError).code;
}

describe("mock API follows contract server rules", () => {
  it("rejects issue detail and writes for a non-officer with FORBIDDEN", async () => {
    const a = api("OPERATOR");
    expect(await code(a.getIssue(I3))).toBe("FORBIDDEN");
    expect(await code(a.createWorkOrder(I3, { idempotencyKey: KEY_A, riskAssessmentId: KEY_A }))).toBe("FORBIDDEN");
  });

  it("rejects a request that fails the shared schema", async () => {
    const a = api();
    expect(await code(a.createWorkOrder(I3, { idempotencyKey: "not-a-uuid", riskAssessmentId: KEY_A }))).toBe("VALIDATION_FAILED");
  });

  it("replays the original work order for the same idempotency key and body", async () => {
    const a = api();
    const body = { idempotencyKey: KEY_A, riskAssessmentId: await riskId(a, I3), assignedTeam: "Demo Team" };
    const first = await a.createWorkOrder(I3, body);
    const replay = await a.createWorkOrder(I3, body);
    expect(first.created).toBe(true);
    expect(replay.created).toBe(false);
    expect(replay.workOrder.id).toBe(first.workOrder.id);
    expect((await a.getIssue(I3)).workOrders).toHaveLength(1);
  });

  it("returns IDEMPOTENCY_CONFLICT for the same key with a different body", async () => {
    const a = api();
    const riskAssessmentId = await riskId(a, I3);
    await a.createWorkOrder(I3, { idempotencyKey: KEY_A, riskAssessmentId });
    expect(await code(a.createWorkOrder(I3, { idempotencyKey: KEY_A, riskAssessmentId, notes: "changed" }))).toBe("IDEMPOTENCY_CONFLICT");
  });

  it("returns ACTIVE_WORK_ORDER_EXISTS, RISK_ASSESSMENT_MISMATCH and ISSUE_NOT_OPEN", async () => {
    const a = api();
    expect(await code(a.createWorkOrder(I2, { idempotencyKey: KEY_A, riskAssessmentId: await riskId(a, I2) }))).toBe("ACTIVE_WORK_ORDER_EXISTS");
    expect(await code(a.createWorkOrder(I3, { idempotencyKey: KEY_B, riskAssessmentId: await riskId(a, I1) }))).toBe("RISK_ASSESSMENT_MISMATCH");
    expect(await code(a.createWorkOrder(I4, { idempotencyKey: KEY_B, riskAssessmentId: await riskId(a, I4) }))).toBe("ISSUE_NOT_OPEN");
  });

  it("enforces transitions, resolves the issue, and closes the work order", async () => {
    const a = api();
    const { workOrder } = await a.createWorkOrder(I3, { idempotencyKey: KEY_A, riskAssessmentId: await riskId(a, I3) });
    expect(await code(a.updateWorkOrder(workOrder.id, { status: "RESOLVED" }))).toBe("INVALID_TRANSITION");
    const started = await a.updateWorkOrder(workOrder.id, { status: "IN_PROGRESS" });
    expect(started.workOrder.startedAt).not.toBeNull();
    const resolved = await a.updateWorkOrder(workOrder.id, { status: "RESOLVED" });
    expect(resolved.workOrder.resolvedAt).not.toBeNull();
    expect((await a.getIssue(I3)).issue.status).toBe("RESOLVED");
    expect(await code(a.updateWorkOrder(workOrder.id, { notes: "late edit" }))).toBe("WORK_ORDER_CLOSED");
  });
});
