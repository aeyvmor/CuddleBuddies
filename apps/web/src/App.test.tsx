import { useRef, useState } from "react";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { App } from "./App";
import { createMockApi } from "./api/mockClient";
import { ApiError, type ActorRole } from "./api/types";

function Harness({ initialRole = "VIEWER" as ActorRole }) {
  const [role, setRole] = useState<ActorRole>(initialRole);
  const ref = useRef(role);
  ref.current = role;
  const [api] = useState(() => createMockApi({ getRole: () => ref.current }));
  return <App api={api} role={role} onRoleChange={setRole} />;
}

async function openIssue(user: ReturnType<typeof userEvent.setup>, markerName: RegExp) {
  await user.click(await screen.findByRole("button", { name: markerName }));
  return screen.findByRole("article");
}

describe("operations dashboard", () => {
  it("labels synthetic data and lists seeded issues", async () => {
    render(<Harness />);
    expect(await screen.findAllByText("SYNTHETIC DEMO DATA")).not.toHaveLength(0);
    expect(await screen.findAllByRole("button", { name: /Map marker/ })).toHaveLength(4);
  });

  it("filters the map by severity", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await screen.findAllByRole("button", { name: /Map marker/ });
    await user.selectOptions(screen.getByLabelText("Severity"), "CRITICAL");
    expect(await screen.findAllByRole("button", { name: /Map marker/ })).toHaveLength(1);
  });

  it("shows unavailable score inputs as unavailable, not zero", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const detail = await openIssue(user, /SYN-ISSUE-001/);
    const weather = within(detail).getByRole("row", { name: /Weather/ });
    expect(weather).toHaveTextContent(/Unavailable/);
    expect(weather).not.toHaveTextContent(/^Weather0/);
    expect(within(detail).getByText(/not counted as zero risk/)).toBeInTheDocument();
  });

  it("shows a failed processing capture as a failure, with no detection", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const detail = await openIssue(user, /SYN-ISSUE-001/);
    expect(within(detail).getByRole("alert")).toHaveTextContent(/Processing failed \(PROVIDER_UNAVAILABLE\)/);
  });

  it("blocks work-order creation for a viewer", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const detail = await openIssue(user, /SYN-ISSUE-003/);
    expect(within(detail).getByRole("button", { name: "Create work order" })).toBeDisabled();
  });

  it("lets an officer create a work order and advance it to RESOLVED", async () => {
    const user = userEvent.setup();
    render(<Harness initialRole="OFFICER" />);
    const detail = await openIssue(user, /SYN-ISSUE-003/);
    await user.type(within(detail).getByLabelText("Assignee"), "Demo Crew 3");
    await user.click(within(detail).getByRole("button", { name: "Create work order" }));

    const wo = await screen.findByRole("region", { name: "Work order" });
    expect(await within(wo).findByText("Open")).toBeInTheDocument();
    expect(wo).toHaveTextContent("Assigned to Demo Crew 3");

    await user.click(within(wo).getByRole("button", { name: "Mark In progress" }));
    expect(await within(wo).findByText("In progress")).toBeInTheDocument();

    await user.click(within(wo).getByRole("button", { name: "Mark Resolved" }));
    expect(await within(wo).findByText("Resolved")).toBeInTheDocument();
    expect(within(wo).queryByRole("button", { name: /Mark/ })).not.toBeInTheDocument();
  });
});

describe("mock api server rules", () => {
  it("rejects writes from a non-officer with FORBIDDEN", async () => {
    const api = createMockApi({ getRole: () => "VIEWER" });
    await expect(api.createWorkOrder("SYN-ISSUE-003", { assignee: null, notes: null })).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });

  it("rejects an invalid transition and a duplicate work order", async () => {
    const api = createMockApi({ getRole: () => "OFFICER" });
    const wo = await api.createWorkOrder("SYN-ISSUE-003", { assignee: null, notes: null });
    await expect(api.createWorkOrder("SYN-ISSUE-003", { assignee: null, notes: null })).rejects.toMatchObject({
      code: "WORK_ORDER_EXISTS",
    });
    const err = await api.updateWorkOrder(wo.id, { status: "RESOLVED" }).catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err.code).toBe("INVALID_TRANSITION");
  });
});
