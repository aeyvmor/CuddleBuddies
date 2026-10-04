import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { WorkOrder } from "./api/types";
import { appendNote, WorkOrderPanel } from "./components/WorkOrderPanel";

const wo = (status: WorkOrder["status"], notes: string | null = null): WorkOrder => ({
  id: "0b6f1d4e-6a3c-4c1e-9d2a-7f00000000a1",
  issueId: "0b6f1d4e-6a3c-4c1e-9d2a-7f00000000b1",
  riskAssessmentId: "0b6f1d4e-6a3c-4c1e-9d2a-7f00000000c1",
  status,
  assignedTeam: "Drainage Team (demo)",
  notes,
  createdBySubject: "demo-officer",
  createdAt: "2026-10-04T00:00:00.000Z",
  updatedAt: "2026-10-04T00:00:00.000Z",
  startedAt: status === "OPEN" ? null : "2026-10-04T00:10:00.000Z",
  resolvedAt: null,
  version: 1,
});

function setup(status: WorkOrder["status"], overrides: Partial<Parameters<typeof WorkOrderPanel>[0]> = {}) {
  const calls: string[] = [];
  const onAdvance = vi.fn(async (_id: string, s: string, details?: { notes?: string; assignedTeam?: string }) => void calls.push(`status:${s}:${details?.notes ?? ""}:${details?.assignedTeam ?? ""}`));
  const onAddPhoto = vi.fn(async (_id: string, input: { note?: string }) => void calls.push(`photo:${input.note}`));
  render(
    <WorkOrderPanel
      role="OFFICER"
      issueStatus="OPEN"
      riskAssessmentId="0b6f1d4e-6a3c-4c1e-9d2a-7f00000000c1"
      workOrders={[wo(status, "Created by officer.")]}
      resolutionEvidence={[]}
      onCreate={async () => undefined}
      onAdvance={onAdvance}
      onAddPhoto={onAddPhoto}
      retry={{ tried: () => false, mark: () => undefined } as never}
      onReload={() => undefined}
      {...overrides}
    />,
  );
  return { calls, onAdvance, onAddPhoto };
}

const jpeg = (name: string) => new File([new Uint8Array([0xff, 0xd8, 0xff])], name, { type: "image/jpeg" });

describe("field report dialog", () => {
  it("opens when work starts, requires findings and on-site confirmation, then saves notes, crew, and photos", async () => {
    const user = userEvent.setup();
    const { calls } = setup("OPEN");
    await user.click(screen.getByRole("button", { name: "Mark In progress" }));
    const dialog = screen.getByRole("dialog", { name: "Start repair work: field inspection" });
    const submit = within(dialog).getByRole("button", { name: "Confirm and start work" });
    expect(submit).toBeDisabled();
    expect(within(dialog).getByLabelText("Crew / team on site")).toHaveValue("Drainage Team (demo)");
    await user.clear(within(dialog).getByLabelText("Crew / team on site"));
    await user.type(within(dialog).getByLabelText("Crew / team on site"), "Barangay crew 2");
    await user.type(within(dialog).getByLabelText("Inspection findings"), "Inlet 70% blocked with plastic.");
    expect(submit).toBeDisabled(); // not confirmed yet
    await user.click(within(dialog).getByRole("checkbox", { name: "The crew inspected the site in person" }));
    await user.upload(within(dialog).getByLabelText(/Site photos/), [jpeg("a.jpg"), jpeg("b.jpg")]);
    await user.click(submit);
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(calls[0]).toMatch(/^status:IN_PROGRESS:Created by officer\.\n\n\[Field inspection \d{4}-\d\d-\d\d \d\d:\d\d UTC\] Inlet 70% blocked with plastic\.:Barangay crew 2$/);
    expect(calls.slice(1)).toEqual(["photo:Site inspection photo", "photo:Site inspection photo"]);
  });

  it("uploads after photos before resolving", async () => {
    const user = userEvent.setup();
    const { calls } = setup("IN_PROGRESS");
    await user.click(screen.getByRole("button", { name: "Mark Resolved" }));
    const dialog = screen.getByRole("dialog", { name: "Complete repair: close-out report" });
    await user.type(within(dialog).getByLabelText("Work done"), "Cleared the grate and flushed the inlet.");
    await user.click(within(dialog).getByRole("checkbox"));
    await user.upload(within(dialog).getByLabelText(/After photos/), jpeg("after.jpg"));
    await user.click(within(dialog).getByRole("button", { name: "Confirm repair complete" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(calls[0]).toBe("photo:After repair photo");
    expect(calls[1]).toMatch(/^status:RESOLVED:.*Repair completed .* UTC\] Cleared the grate/s);
  });

  it("rejects non-JPEG files, cancels with Escape without saving, and keeps the dialog open on failure", async () => {
    const user = userEvent.setup({ applyAccept: false });
    const onAdvance = vi.fn().mockRejectedValue(new Error("network"));
    setup("IN_PROGRESS", { onAdvance });
    await user.click(screen.getByRole("button", { name: "Mark Resolved" }));
    const dialog = screen.getByRole("dialog");
    await user.upload(within(dialog).getByLabelText(/After photos/), new File(["x"], "x.png", { type: "image/png" }));
    expect(within(dialog).getByRole("alert")).toBeInTheDocument();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(onAdvance).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Mark Resolved" }));
    await user.type(within(screen.getByRole("dialog")).getByLabelText("Work done"), "Cleared the grate.");
    await user.click(within(screen.getByRole("dialog")).getByRole("checkbox"));
    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Confirm repair complete" }));
    expect(await within(screen.getByRole("dialog")).findByRole("alert")).toHaveTextContent(/Could not save|network/);
  });

  it("appends notes and keeps the newest text within 2000 characters", () => {
    expect(appendNote(null, "a")).toBe("a");
    expect(appendNote("old", "new")).toBe("old\n\nnew");
    const long = appendNote("x".repeat(1990), "[Repair completed] done");
    expect(long.length).toBe(2000);
    expect(long.endsWith("[Repair completed] done")).toBe(true);
  });
});
