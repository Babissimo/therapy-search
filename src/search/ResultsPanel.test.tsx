// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ResultsPanel } from "./ResultsPanel";

function Harness() {
  const [open, setOpen] = useState(true);
  return (
    <TooltipProvider>
      <ResultsPanel open={open} onOpenChange={setOpen} tabs={<p>The tabs</p>} footer={<button type="button">Load more</button>}>
        <p>The list</p>
      </ResultsPanel>
    </TooltipProvider>
  );
}

const panel = () => screen.queryByRole("region", { name: "Results and shortlist" });

describe("ResultsPanel", () => {
  it("collapses to a button that brings it back", () => {
    render(<Harness />);
    expect(panel()?.textContent).toContain("The tabs");
    fireEvent.click(screen.getByRole("button", { name: "Hide list" }));
    expect(panel()).toBeNull();
    const show = screen.getByRole("button", { name: "Show list" });
    expect(show.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(show);
    expect(panel()?.textContent).toContain("The list");
    expect(screen.getByRole("button", { name: "Hide list" }).getAttribute("aria-expanded")).toBe("true");
  });

  it("keeps its tabs and footer outside the scrolling list", () => {
    render(<Harness />);
    const list = screen.getByText("The list").parentElement!;
    expect(list.className).toContain("overflow-y-auto");
    expect(list.contains(screen.getByText("The tabs"))).toBe(false);
    expect(list.contains(screen.getByRole("button", { name: "Load more" }))).toBe(false);
  });
});
