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
      <ResultsPanel open={open} onOpenChange={setOpen} tabs={<p>The tabs</p>} masthead={<p>The masthead</p>} footer={<button type="button">Load more</button>}>
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
    expect(screen.getByText("The list").closest("[inert]")).not.toBeNull();
    expect(screen.getByText("The tabs").closest("[inert]")).not.toBeNull();
    expect(screen.getByRole("button", { name: "Show list" })).toBe(toggle);
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(document.activeElement).toBe(toggle);
    fireEvent.click(toggle);
    expect(screen.getByText("The list").closest("[inert]")).toBeNull();
    expect(screen.getByText("The tabs").closest("[inert]")).toBeNull();
    expect(screen.getByRole("button", { name: "Hide list" })).toBe(toggle);
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
  });

  it("names its toggle on a touch screen, by its first word beside the masthead, which makes room for it, and whole over the map", () => {
    render(<Harness />);
    const shown = () => [...screen.getByRole("button", { name: /list$/ }).querySelectorAll(".stacked\\:not-sr-only")].map((span) => span.textContent);
    expect(shown()).toEqual(["Hide"]);
    expect(screen.getByText("The masthead").parentElement?.className).toContain("pointer-coarse:pl-24");
    fireEvent.click(screen.getByRole("button", { name: "Hide list" }));
    expect(shown()).toEqual(["Show list"]);
  });

  it("heads the panel with the masthead, outside its region and hidden with it", () => {
    render(<Harness />);
    const masthead = screen.getByText("The masthead");
    expect(panel().contains(masthead)).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "Hide list" }));
    expect(masthead.closest("[inert]")).not.toBeNull();
  });

  it("leaves its footer in reach as it hides, within its region, so the footer can keep a control in view", () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: "Hide list" }));
    const footer = screen.getByRole("button", { name: "Load more" });
    expect(footer.closest("[inert]")).toBeNull();
    expect(panel().contains(footer)).toBe(true);
  });

  it("positions nothing between its footer and its outer box, which the footer's control is placed against", () => {
    render(<Harness />);
    const outer = screen.getByRole("button", { name: "Hide list" }).parentElement!;
    const between = [];
    for (let at = screen.getByRole("button", { name: "Load more" }).parentElement; at && at !== outer; at = at.parentElement) between.push(at);
    expect(between.filter((element) => /\b(relative|absolute|fixed|sticky)\b/.test(element.className))).toEqual([]);
  });

  it("keeps its tabs and footer outside the scrolling list", () => {
    render(<Harness />);
    const list = screen.getByText("The list").parentElement!;
    expect(list.className).toContain("overflow-y-auto");
    expect(list.contains(screen.getByText("The tabs"))).toBe(false);
    expect(list.contains(screen.getByRole("button", { name: "Load more" }))).toBe(false);
  });
});
