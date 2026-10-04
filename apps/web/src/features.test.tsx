import { useRef, useState } from "react";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { App } from "./App";
import type { ApiClient } from "./api/client";
import { createMockApi } from "./api/mockClient";
import { ApiError, type IssueDetailResponse, type Role } from "./api/types";
import { createSyntheticIssues, SYNTHETIC_ISSUE_IDS } from "./data/syntheticData";
import { completeFieldReport } from "./test/fieldReport";

function Harness({ wrap, seed }: { wrap?: (api: ApiClient) => ApiClient; seed?: IssueDetailResponse[] }) {
  const [role, setRole] = useState<Role>("OFFICER");
  const ref = useRef(role);
  ref.current = role;
  const [api] = useState(() => {
    const base = createMockApi({ getRole: () => ref.current, seed });
    return wrap ? wrap(base) : base;
  });
  return <App api={api} role={role} dataSource="mock" account={{ kind: "demo-role", onRoleChange: setRole }} />;
}

const open = async (user: ReturnType<typeof userEvent.setup>, name: RegExp) => {
  await user.click(await screen.findByRole("button", { name }));
  return screen.findByRole("article");
};
const jpeg = (bytes = 4, name = "after.jpg") => new File([new Uint8Array(bytes)], name, { type: "image/jpeg" });

describe("after photo (resolution evidence)", () => {
  it("rejects non-JPEG and oversized files before uploading, then uploads a JPEG and shows it", async () => {
    const user = userEvent.setup({ applyAccept: false });
    render(<Harness />);
    // Standing water has an IN_PROGRESS work order.
    const detail = await open(user, /Map marker: Standing water/);
    const wo = within(detail).getByRole("region", { name: "Work order" });
    expect(within(wo).getByText(/No after photo yet/)).toBeInTheDocument();
    const input = within(wo).getByLabelText(/Photo \(JPEG/);
    const button = within(wo).getByRole("button", { name: "Upload after photo" });
    expect(button).toBeDisabled();

    await user.upload(input, new File(["x"], "after.png", { type: "image/png" }));
    expect(within(wo).getByRole("alert")).toHaveTextContent("Choose a JPEG photo");
    expect(button).toBeDisabled();

    await user.upload(input, jpeg(10 * 1024 * 1024 + 1));
    expect(within(wo).getByRole("alert")).toHaveTextContent("the limit is 10 MB");

    await user.upload(input, jpeg());
    expect(within(wo).queryByRole("alert")).not.toBeInTheDocument();
    await user.type(within(wo).getByLabelText("Note (optional)"), "Grate cleared");
    await user.click(button);
    expect(await within(wo).findByText("After photo uploaded.")).toBeInTheDocument();
    expect(await within(wo).findByRole("img", { name: "Grate cleared" })).toBeInTheDocument();
    expect(within(wo).getByText(/Grate cleared/, { selector: "span" })).toBeInTheDocument();
  });

  it("is not offered while the work order is still OPEN", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const detail = await open(user, /Map marker: Damaged drain/);
    await user.click(within(detail).getByRole("button", { name: "Create work order" }));
    const wo = await screen.findByRole("region", { name: "Work order" });
    await within(wo).findByRole("button", { name: "Mark In progress" });
    expect(within(wo).queryByText("After photo (optional)")).not.toBeInTheDocument();
  });
});

describe("conflicts are shown inline and the issue is refetched", () => {
  it("shows ACTIVE_WORK_ORDER_EXISTS with its reference, then shows the current state", async () => {
    const user = userEvent.setup();
    let getIssueCalls = 0;
    render(
      <Harness
        wrap={(api) => ({
          ...api,
          getIssue: (id) => {
            getIssueCalls += 1;
            return api.getIssue(id);
          },
          createWorkOrder: async () => {
            throw new ApiError({ code: "ACTIVE_WORK_ORDER_EXISTS", message: "This issue already has an active work order.", requestId: "req-409", status: 409 });
          },
        })}
      />,
    );
    const detail = await open(user, /Map marker: Damaged drain/);
    const before = getIssueCalls;
    await user.click(within(detail).getByRole("button", { name: "Create work order" }));
    const wo = within(screen.getByRole("article")).getByRole("region", { name: "Work order" });
    const alert = await within(wo).findByRole("alert");
    expect(alert).toHaveTextContent("This issue already has an active work order.");
    expect(alert).toHaveTextContent("Reference: req-409");
    await waitFor(() => expect(getIssueCalls).toBeGreaterThan(before));
  });
});

describe("evidence images", () => {
  const withImage = () => {
    const seed = createSyntheticIssues();
    seed[2]!.observations[0]!.evidence = { status: "AVAILABLE", url: "https://bucket.test/obs.jpg?X-Amz-Expires=300", expiresAt: "2026-10-04T01:05:00Z" };
    return seed;
  };

  it("refetches the issue once when an image fails, then shows the failure with a manual reload", async () => {
    const user = userEvent.setup();
    const getIssue = vi.fn();
    render(
      <Harness
        seed={withImage()}
        wrap={(api) => ({
          ...api,
          getIssue: (id) => {
            getIssue(id);
            return api.getIssue(id);
          },
        })}
      />,
    );
    const detail = await open(user, /Map marker: Damaged drain/);
    const calls = getIssue.mock.calls.length;
    fireEvent.error(within(detail).getByRole("img", { name: /small crack/ }));
    await waitFor(() => expect(getIssue.mock.calls.length).toBe(calls + 1));
    // The refetched image fails as well: no second automatic refetch.
    fireEvent.error(await within(screen.getByRole("article")).findByRole("img", { name: /small crack/ }));
    expect(await screen.findByText(/Image could not be loaded/)).toBeInTheDocument();
    expect(getIssue.mock.calls.length).toBe(calls + 1);
    await user.click(screen.getByRole("button", { name: /Reload images/ }));
    await waitFor(() => expect(getIssue.mock.calls.length).toBe(calls + 2));
    expect(await within(screen.getByRole("article")).findByRole("img", { name: /small crack/ })).toBeInTheDocument();
  });

  it("shows unavailable evidence with its reason", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const detail = await open(user, /Map marker: Blocked drain/);
    expect(within(detail).getAllByRole("img", { name: "No image: Image not uploaded" }).length).toBeGreaterThan(0);
  });
});

describe("analytics summary", () => {
  it("shows the summary with the synthetic-data badge", async () => {
    render(<Harness />);
    const section = await screen.findByRole("region", { name: "Analytics summary" });
    expect(within(section).getByText("INCLUDES SYNTHETIC DEMO DATA")).toBeInTheDocument();
    const issues = (await within(section).findByText("Issues")).closest("div")!;
    expect(within(issues as HTMLElement).getByText("3 open · 1 resolved")).toBeInTheDocument();
    expect(issues).toHaveTextContent(/^Issues4/);
    expect(within(section).getByText("Mean time to resolve").closest("div")).toHaveTextContent("4 h");
    expect(within(section).getByText("Work orders").closest("div")).toHaveTextContent("0 open · 1 in progress · 1 resolved");
    expect(within(section).getByRole("heading", { name: "By area" })).toBeInTheDocument();
  });

  it("updates after a work order changes", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const section = await screen.findByRole("region", { name: "Analytics summary" });
    await within(section).findByText("Issues");
    const detail = await open(user, /Map marker: Standing water/);
    await user.click(within(detail).getByRole("button", { name: "Mark Resolved" }));
    await completeFieldReport(user, "RESOLVE");
    await waitFor(() => expect(within(section).getByText("Work orders").closest("div")).toHaveTextContent("0 open · 0 in progress · 2 resolved"));
  });

  it("shows its own failure without hiding the queue", async () => {
    render(<Harness wrap={(api) => ({ ...api, analyticsSummary: () => Promise.reject(new ApiError({ code: "SERVICE_UNAVAILABLE", message: "Database is starting.", requestId: "req-503" })) })} />);
    const section = await screen.findByRole("region", { name: "Analytics summary" });
    expect(await within(section).findByRole("alert")).toHaveTextContent("Database is starting. (reference req-503)");
    expect(await screen.findAllByRole("button", { name: /Map marker/ })).toHaveLength(SYNTHETIC_ISSUE_IDS.length);
  });
});
