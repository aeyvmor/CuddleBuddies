import { useRef, useState } from "react";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { App } from "./App";
import { createMockApi } from "./api/mockClient";
import type { Role } from "./api/types";

function Harness({ initialRole }: { initialRole: Role }) {
  const [role, setRole] = useState<Role>(initialRole);
  const ref = useRef(role);
  ref.current = role;
  const [api] = useState(() => createMockApi({ getRole: () => ref.current }));
  return <App api={api} role={role} dataSource="mock" account={{ kind: "demo-role", onRoleChange: setRole }} />;
}

type User = ReturnType<typeof userEvent.setup>;

/** Press Tab until `target` has focus; fails if it is not reachable within `max` presses. */
async function tabTo(user: User, target: () => HTMLElement, max = 60) {
  for (let i = 0; i < max; i++) {
    await user.tab();
    if (document.activeElement === target()) return;
  }
  throw new Error(`not reachable by Tab: ${target().outerHTML.slice(0, 80)}`);
}

const status = () => screen.getAllByRole("status").map((s) => s.textContent).join(" | ");

describe("keyboard path: review an issue, create a work order, resolve it", () => {
  it("works with Tab, typing and Enter only, with focus kept and changes announced", async () => {
    const user = userEvent.setup();
    render(<Harness initialRole="OFFICER" />);
    const list = await screen.findByRole("list", { name: "Issues" });
    const issueButton = () => within(list).getByRole("button", { name: /Damaged drain/ });

    // 1. Reach the issue in the list and open it with Enter.
    await tabTo(user, issueButton);
    await user.keyboard("{Enter}");
    expect(issueButton()).toHaveAttribute("aria-pressed", "true");
    const detail = await screen.findByRole("article", { name: "Issue detail: Damaged drain" });
    await waitFor(() => expect(status()).toContain("Showing issue detail: Damaged drain, 4 of 4."));

    // 2. Fill the form and submit with Enter on the button.
    const wo = within(detail).getByRole("region", { name: "Work order" });
    await tabTo(user, () => within(wo).getByLabelText(/Assigned team/));
    await user.keyboard("Demo Team 9");
    await tabTo(user, () => within(wo).getByLabelText("Notes"));
    await user.keyboard("Keyboard-created synthetic order");
    await tabTo(user, () => within(wo).getByRole("button", { name: "Create work order" }));
    await user.keyboard("{Enter}");

    // The form disappears, so focus moves to the section heading and the result is announced.
    const heading = within(wo).getByRole("heading", { name: "Work order" });
    await waitFor(() => expect(document.activeElement).toBe(heading));
    await waitFor(() => expect(status()).toContain("Work order created. Status: Open."));
    expect(within(wo).getByRole("listitem", { current: "step" })).toHaveTextContent("Open");

    // 3. Advance to IN_PROGRESS: the same button stays focused with its next label.
    await tabTo(user, () => within(wo).getByRole("button", { name: "Mark In progress" }));
    await user.keyboard("{Enter}");
    const resolveButton = await within(wo).findByRole("button", { name: "Mark Resolved" });
    expect(document.activeElement).toBe(resolveButton);
    await waitFor(() => expect(status()).toContain("Work order status changed to In progress."));

    // 4. Resolve: the button disappears, so focus returns to the heading.
    await user.keyboard("{Enter}");
    await waitFor(() => expect(document.activeElement).toBe(heading));
    await waitFor(() => expect(status()).toContain("Work order status changed to Resolved."));
    expect(within(wo).getByRole("listitem", { current: "step" })).toHaveTextContent("Resolved");
    expect(within(wo).queryByRole("button", { name: /^Mark/ })).not.toBeInTheDocument();
    expect(within(wo).queryByRole("button", { name: "Create work order" })).not.toBeInTheDocument();
    // Long by design (Tab through the whole page, including the map's controls): about 4.5 s, so the 5 s default is too tight under load.
  }, 20000);

  it("can open an issue from a map marker with the keyboard", async () => {
    const user = userEvent.setup();
    render(<Harness initialRole="OFFICER" />);
    const marker = await screen.findByRole("button", { name: /Map marker: Standing water/ });
    await tabTo(user, () => marker);
    await user.keyboard(" ");
    expect(marker).toHaveAttribute("aria-pressed", "true");
    expect(await screen.findByRole("article", { name: "Issue detail: Standing water" })).toBeInTheDocument();
  });

  it("offers a skip link to the detail once an issue is shown", async () => {
    const user = userEvent.setup();
    render(<Harness initialRole="OFFICER" />);
    expect(screen.queryByRole("link", { name: "Skip to issue detail" })).not.toBeInTheDocument();
    await user.click(await screen.findByRole("button", { name: /Map marker: Blocked drain/ }));
    await screen.findByRole("article");
    expect(screen.getByRole("link", { name: "Skip to issue detail" })).toHaveAttribute("href", "#issue-detail");
  });

  it("announces a refused request as an alert", async () => {
    render(<Harness initialRole="OPERATOR" />);
    expect((await screen.findAllByRole("alert"))[0]).toHaveTextContent("Requires role OFFICER.");
  });
});

describe("meaning is not conveyed by colour alone", () => {
  it("gives markers, severity and status a text equivalent", async () => {
    const user = userEvent.setup();
    render(<Harness initialRole="OFFICER" />);
    for (const m of await screen.findAllByRole("button", { name: /Map marker/ })) {
      expect(m.getAttribute("aria-label")).toMatch(/severity/);
      expect(m.textContent).toMatch(/^[CHMLN?]$/);
    }
    const list = screen.getByRole("list", { name: "Issues" });
    expect(within(list).getAllByText(/^(Critical|High|Moderate|Low|None|Severity unknown)$/)).toHaveLength(4);
    expect(within(list).getAllByText(/^Issue (Open|Resolved)$/)).toHaveLength(4);
    await user.click(screen.getByRole("button", { name: /Map marker: Standing water/ }));
    const steps = within(await screen.findByRole("list", { name: "Work order progress" })).getAllByRole("listitem");
    expect(steps.map((s) => s.textContent)).toEqual(["OpenDone", "In progressCurrent", "ResolvedNot started"]);
  });
});
