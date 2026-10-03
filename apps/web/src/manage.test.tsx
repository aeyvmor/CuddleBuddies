import { useRef, useState } from "react";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { App } from "./App";
import type { ApiClient } from "./api/client";
import { createMockApi } from "./api/mockClient";
import type { IssueDetailResponse, Role } from "./api/types";
import { createSyntheticIssues } from "./data/syntheticData";

function Harness({ api: given, seed }: { api?: (getRole: () => Role) => ApiClient; seed?: IssueDetailResponse[] }) {
  const [role, setRole] = useState<Role>("OFFICER");
  const ref = useRef(role);
  ref.current = role;
  const [api] = useState(() => (given ? given(() => ref.current) : createMockApi({ getRole: () => ref.current, seed })));
  return <App api={api} role={role} onRoleChange={setRole} />;
}

const MARKER = /Map marker/;
const rows = () => within(screen.getByRole("list", { name: "Issues" })).getAllByRole("button");

/** n synthetic issues with distinct ids and long area names, cloned from the demo seed. */
function manyIssues(n: number): IssueDetailResponse[] {
  const base = createSyntheticIssues();
  return Array.from({ length: n }, (_, i) => {
    const d = structuredClone(base[i % base.length]!);
    const id = `5e000000-0000-4000-8000-7${String(i).padStart(11, "0")}`;
    d.issue.id = id;
    d.issue.areaName = `Barangay San Isidro Labrador Extension Zone ${i % 7} (Northern Riverside District)`;
    if (d.riskAssessment) d.riskAssessment = { ...d.riskAssessment, id: `5e000000-0000-4000-8000-8${String(i).padStart(11, "0")}`, issueId: id };
    d.workOrders = d.workOrders.map((w, k) => ({ ...w, id: `5e000000-0000-4000-8000-9${String(i * 10 + k).padStart(11, "0")}`, issueId: id }));
    return d;
  });
}

describe("managing the queue", () => {
  it("shows how many issues match and clears all filters at once", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    expect(await screen.findByText("Showing all 4 issues")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Clear filters/ })).not.toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText("Issue status"), "OPEN");
    await user.selectOptions(screen.getByLabelText("Severity"), "CRITICAL");
    expect(await screen.findByText("Showing 1 of 4 issues")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Clear filters (2)" }));
    expect(await screen.findByText("Showing all 4 issues")).toBeInTheDocument();
    expect(screen.getByLabelText("Severity")).toHaveValue("");
    expect(screen.getByLabelText("Issue status")).toHaveValue("");
  });

  it("filters by issue status", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await screen.findAllByRole("button", { name: MARKER });
    await user.selectOptions(screen.getByLabelText("Issue status"), "RESOLVED");
    await waitFor(() => expect(rows()).toHaveLength(1));
    expect(rows()[0]).toHaveTextContent("Road damage");
  });

  it("lists issues highest priority first", async () => {
    render(<Harness />);
    await screen.findAllByRole("button", { name: MARKER });
    const titles = rows().map((r) => r.querySelector("span span span")?.textContent);
    expect(titles).toEqual(["Standing water", "Blocked drain", "Road damage", "Damaged drain"]);
  });

  it("steps through the queue with Previous and Next, and closes the detail", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click((await screen.findAllByRole("button", { name: MARKER }))[0]!);
    // Open the top of the queue.
    await user.click(rows()[0]!);
    let article = await screen.findByRole("article", { name: "Issue detail: Standing water" });
    expect(within(article).getByText("Issue 1 of 4 in the queue")).toBeInTheDocument();
    expect(within(article).getByRole("button", { name: /Previous/ })).toBeDisabled();

    await user.click(within(article).getByRole("button", { name: /Next/ }));
    article = await screen.findByRole("article", { name: "Issue detail: Blocked drain" });
    expect(within(article).getByText("Issue 2 of 4 in the queue")).toBeInTheDocument();
    expect(rows()[1]).toHaveAttribute("aria-pressed", "true");

    await user.click(within(article).getByRole("button", { name: /Previous/ }));
    article = await screen.findByRole("article", { name: "Issue detail: Standing water" });

    await user.click(within(article).getByRole("button", { name: "Close issue detail" }));
    await waitFor(() => expect(screen.queryByRole("article")).not.toBeInTheDocument());
    expect(screen.getByText("No issue selected")).toBeInTheDocument();
    expect(rows().every((r) => r.getAttribute("aria-pressed") === "false")).toBe(true);
  });

  it("Next stops at the end of the filtered queue", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await screen.findAllByRole("button", { name: MARKER });
    await user.selectOptions(screen.getByLabelText("Work order"), "NONE");
    await waitFor(() => expect(rows()).toHaveLength(2));
    await user.click(rows()[1]!);
    const article = await screen.findByRole("article");
    expect(within(article).getByText("Issue 2 of 2 in the queue")).toBeInTheDocument();
    expect(within(article).getByRole("button", { name: /Next/ })).toBeDisabled();
  });
});

describe("failures are shown as failures", () => {
  it("never shows zero counts or 'no matches' when the list cannot load, and recovers on retry", async () => {
    const user = userEvent.setup();
    let fail = true;
    const make = (getRole: () => Role): ApiClient => {
      const real = createMockApi({ getRole });
      return { ...real, listIssues: (f) => (fail ? Promise.reject(new Error("network down")) : real.listIssues(f)) };
    };
    render(<Harness api={make} />);
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Could not load issues.");
    expect(screen.getAllByText("Issues could not be loaded.").length).toBeGreaterThan(0);
    expect(screen.queryByText("No issues match the current filters.")).not.toBeInTheDocument();
    const tiles = within(screen.getByRole("region", { name: "Issue summary" }));
    expect(tiles.getAllByText("–")).toHaveLength(5);
    expect(tiles.queryByText("0")).not.toBeInTheDocument();

    fail = false;
    await user.click(within(alert).getByRole("button", { name: /Try again/ }));
    expect(await screen.findByText("Showing all 4 issues")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});

describe("stress", () => {
  it("renders 300 issues, filters them, and still opens the last one", async () => {
    const user = userEvent.setup();
    const t0 = performance.now();
    render(<Harness seed={manyIssues(300)} />);
    expect(await screen.findByText("Showing all 300 issues", {}, { timeout: 5000 })).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: MARKER })).toHaveLength(300);
    expect(rows()).toHaveLength(300);
    const renderMs = performance.now() - t0;

    // The long area name is shown (clamped by CSS) with the full text as a tooltip.
    expect(rows()[0]!.querySelector("[title*='Northern Riverside District']")).not.toBeNull();

    await user.click(rows()[299]!);
    const article = await screen.findByRole("article");
    expect(within(article).getByText("Issue 300 of 300 in the queue")).toBeInTheDocument();
    expect(within(article).getByRole("button", { name: /Next/ })).toBeDisabled();

    await user.selectOptions(screen.getByLabelText("Severity"), "CRITICAL");
    await waitFor(() => expect(rows().length).toBe(75));
    // Generous bound for jsdom on a shared CI machine; the browser check is in the README.
    expect(renderMs).toBeLessThan(5000);
  }, 20000);
});
