// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import { ResultsPanel } from "./ResultsPanel";

function Harness() {
  const [open, setOpen] = useState(true);
  return (
    <ResultsPanel open={open} onOpenChange={setOpen} count={257}>
      <p>The list</p>
    </ResultsPanel>
  );
}

describe("ResultsPanel", () => {
  it("collapses to a button that brings it back", () => {
    render(<Harness />);
    expect(screen.getByRole("region", { name: "Results" }).textContent).toContain("257 results");
    fireEvent.click(screen.getByRole("button", { name: "Hide results" }));
    expect(screen.queryByRole("region", { name: "Results" })).toBeNull();
    const show = screen.getByRole("button", { name: "Show results (257)" });
    expect(show.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(show);
    expect(screen.getByRole("region", { name: "Results" }).textContent).toContain("The list");
    expect(screen.getByRole("button", { name: "Hide results" }).getAttribute("aria-expanded")).toBe("true");
  });
});
