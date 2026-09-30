// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { TooltipProvider } from "@/components/ui/tooltip";
import { HelpTip } from "./HelpTip";

describe("HelpTip", () => {
  it("opens on a tap, which ends in the click that closes a Radix tooltip", () => {
    render(<HelpTip label="About Languages">Languages spoken in sessions.</HelpTip>, { wrapper: TooltipProvider });
    const button = screen.getByRole("button", { name: "About Languages" });
    fireEvent.pointerDown(button);
    fireEvent.pointerUp(button);
    fireEvent.focus(button);
    fireEvent.click(button);
    expect(screen.getByRole("tooltip").textContent).toBe("Languages spoken in sessions.");
  });
});
