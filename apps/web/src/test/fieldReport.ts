import { screen, waitFor, within } from "@testing-library/react";
import type { UserEvent } from "@testing-library/user-event";

/** Fills and submits the field-report dialog opened by "Mark In progress" / "Mark Resolved". */
export async function completeFieldReport(user: UserEvent, kind: "START" | "RESOLVE", files: File[] = []) {
  const dialog = await screen.findByRole("dialog");
  if (kind === "START") {
    const team = within(dialog).getByLabelText("Crew / team on site") as HTMLInputElement;
    if (!team.value) await user.type(team, "Demo crew");
  }
  await user.type(within(dialog).getByLabelText(kind === "START" ? "Inspection findings" : "Work done"), "Inspected on site; inlet blocked by debris.");
  await user.click(within(dialog).getByRole("checkbox"));
  if (files.length) await user.upload(within(dialog).getByLabelText(/photos/), files);
  await user.click(within(dialog).getByRole("button", { name: kind === "START" ? "Confirm and start work" : "Confirm repair complete" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
}
