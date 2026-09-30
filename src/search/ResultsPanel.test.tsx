// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { useState, type ReactNode } from "react";
import { describe, expect, it } from "vitest";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ResultsPanel } from "./ResultsPanel";

function Harness({ masthead }: { masthead?: ReactNode }) {
  const [open, setOpen] = useState(true);
  return (
    <TooltipProvider>
      <ResultsPanel open={open} onOpenChange={setOpen} tabs={<p>The tabs</p>} masthead={masthead} footer={<button type="button">Load more</button>}>
        <p>The list</p>
      </ResultsPanel>
    </TooltipProvider>
  );
}

const panel = () => screen.getByRole("region", { name: "Results and shortlist" });

describe("ResultsPanel", () => {
  it("collapses to its toggle, which keeps focus to bring it back", () => {
    render(<Harness />);
    expect(panel().textContent).toContain("The tabs");
    const toggle = screen.getByRole("button", { name: "Hide list" });
    toggle.focus();
    fireEvent.click(toggle);
    // Kept, out of reach, so it can slide away and back with its list as it was.
    expect(panel().closest("[inert]")).not.toBeNull();
    expect(screen.getByRole("button", { name: "Show list" })).toBe(toggle);
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(document.activeElement).toBe(toggle);
    fireEvent.click(toggle);
    expect(panel().closest("[inert]")).toBeNull();
    expect(screen.getByRole("button", { name: "Hide list" })).toBe(toggle);
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
  });

  it("heads the panel with the masthead, outside its region and hidden with it", () => {
    render(<Harness masthead={<p>The masthead</p>} />);
    const masthead = screen.getByText("The masthead");
    expect(panel().contains(masthead)).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "Hide list" }));
    expect(masthead.closest("[inert]")).not.toBeNull();
  });

  it("keeps its tabs and footer outside the scrolling list", () => {
    render(<Harness />);
    const list = screen.getByText("The list").parentElement!;
    expect(list.className).toContain("overflow-y-auto");
    expect(list.contains(screen.getByText("The tabs"))).toBe(false);
    expect(list.contains(screen.getByRole("button", { name: "Load more" }))).toBe(false);
  });
});
