import { useRef, useState } from "react";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { App } from "./App";
import { createMockApi } from "./api/mockClient";
import type { Role } from "./api/types";

function Harness({ initialRole = "OFFICER" as Role }) {
  const [role, setRole] = useState<Role>(initialRole);
  const ref = useRef(role);
  ref.current = role;
  const [api] = useState(() => createMockApi({ getRole: () => ref.current }));
  return <App api={api} role={role} dataSource="mock" account={{ kind: "demo-role", onRoleChange: setRole }} />;
}

const MARKER = /Map marker/;

async function openIssue(user: ReturnType<typeof userEvent.setup>, markerName: RegExp) {
  await user.click(await screen.findByRole("button", { name: markerName }));
  return screen.findByRole("article");
}

describe("operations dashboard", () => {
  it("labels synthetic data and lists seeded issues", async () => {
    render(<Harness />);
    expect(await screen.findAllByText("SYNTHETIC DEMO DATA")).not.toHaveLength(0);
    expect(await screen.findAllByRole("button", { name: MARKER })).toHaveLength(4);
  });

  it("filters the map by severity using contract enum values", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await screen.findAllByRole("button", { name: MARKER });
    await user.selectOptions(screen.getByLabelText("Severity"), "CRITICAL");
    expect(await screen.findAllByRole("button", { name: MARKER })).toHaveLength(1);
  });

  it("shows unknown score inputs as unknown, not zero", async () => {
    const user = userEvent.setup();
    render(<Harness initialRole="OFFICER" />);
    const detail = await openIssue(user, /Map marker: Blocked drain/);
    const weather = within(detail).getByRole("row", { name: /Weather/ });
    expect(weather).toHaveTextContent(/Unknown \(not measured\)/);
    expect(within(detail).getByText(/not counted as zero risk/)).toBeInTheDocument();
    expect(within(detail).getByText(/of 65 measurable points/)).toBeInTheDocument();
  });

  it("shows a failed processing capture as a failure, with no detection", async () => {
    const user = userEvent.setup();
    render(<Harness initialRole="OFFICER" />);
    const detail = await openIssue(user, /Map marker: Blocked drain/);
    expect(within(detail).getByText(/Processing failed \(PROVIDER_UNAVAILABLE\)/)).toBeInTheDocument();
  });

  it("refuses the dashboard to a non-officer with the server's message (as GET /issues does)", async () => {
    render(<Harness initialRole="OPERATOR" />);
    expect((await screen.findAllByRole("alert"))[0]).toHaveTextContent("Requires role OFFICER.");
    expect(screen.queryByRole("button", { name: MARKER })).not.toBeInTheDocument();
    expect(screen.queryByRole("article")).not.toBeInTheDocument();
  });

  it("lets an officer create a work order and advance it to RESOLVED", async () => {
    const user = userEvent.setup();
    render(<Harness initialRole="OFFICER" />);
    const detail = await openIssue(user, /Map marker: Damaged drain/);
    await user.type(within(detail).getByLabelText(/Assigned team/), "Demo Team 3");
    await user.click(within(detail).getByRole("button", { name: "Create work order" }));

    const wo = await screen.findByRole("region", { name: "Work order" });
    const current = () => within(wo).getByRole("listitem", { current: "step" });
    await within(wo).findByRole("button", { name: "Mark In progress" });
    expect(current()).toHaveTextContent("Open");
    expect(wo).toHaveTextContent("Assigned to Demo Team 3");

    await user.click(within(wo).getByRole("button", { name: "Mark In progress" }));
    await within(wo).findByRole("button", { name: "Mark Resolved" });
    expect(current()).toHaveTextContent("In progress");

    await user.click(within(wo).getByRole("button", { name: "Mark Resolved" }));
    expect(await within(wo).findByText("This work order is resolved.")).toBeInTheDocument();
    expect(current()).toHaveTextContent("Resolved");
    expect(within(wo).queryByRole("button", { name: /Mark/ })).not.toBeInTheDocument();
    expect(within(wo).queryByRole("button", { name: "Create work order" })).not.toBeInTheDocument();
    expect(within(await screen.findByRole("article")).getByText("Issue Resolved")).toBeInTheDocument();
  });
});
