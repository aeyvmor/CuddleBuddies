import { render, screen } from "@testing-library/react";
import { RegionImage } from "./components/RegionImage";

describe("RegionImage", () => {
  it("draws each AI-estimated region at its 0-1000 position and describes it in text", () => {
    render(<RegionImage src="https://img.test/a.jpg" alt="Drain inlet partly blocked" regions={[{ label: "BLOCKED_DRAIN", box: [825, 535, 865, 585] }]} />);
    const box = screen.getByTestId("region-box");
    expect(box.style.top).toBe("82.5%");
    expect(box.style.left).toBe("53.5%");
    expect(box.style.height).toBe("4%");
    expect(box.style.width).toBe("5%");
    expect(screen.getByRole("img", { name: "Drain inlet partly blocked" })).toBeInTheDocument();
    expect(screen.getByText(/1 AI-estimated problem area outlined in red: Blocked drain\. Approximate/)).toBeInTheDocument();
  });
});