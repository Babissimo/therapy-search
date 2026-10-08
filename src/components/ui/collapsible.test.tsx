// @vitest-environment jsdom
import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Collapsible, CollapsibleContent } from "./collapsible";

// The roll-down and roll-up the page's styles give it, which jsdom reads but never plays.
let styles: HTMLStyleElement;
beforeEach(() => {
  styles = document.createElement("style");
  styles.textContent =
    "[data-state=open]:not([data-unrolled]) { animation-name: collapsible-down; } [data-state=closed] { animation-name: collapsible-up; }";
  document.head.append(styles);
});
afterEach(() => styles.remove());

// jsdom has no AnimationEvent.
function fire(element: Element, type: "animationstart" | "animationend" | "animationcancel", animationName: string) {
  act(() => void element.dispatchEvent(Object.assign(new Event(type, { bubbles: true }), { animationName })));
}

// Kept mounted while closed, as jsdom plays no roll-up to wait for.
const panel = (open: boolean) => (
  <Collapsible open={open}>
    <CollapsibleContent forceMount>
      <p>Filters</p>
    </CollapsibleContent>
  </Collapsible>
);

describe("CollapsibleContent", () => {
  it("is marked unrolled once it has unrolled, until it rolls up, so it unrolls as it opens and not as it shows again", async () => {
    const { rerender } = render(panel(false));
    // Radix holds back any animation until the first frame after it mounts.
    await act(() => new Promise((resolve) => requestAnimationFrame(resolve)));
    rerender(panel(true));
    const content = screen.getByText("Filters").parentElement!;
    // An animation within it.
    fire(screen.getByText("Filters"), "animationend", "enter");
    expect(content.hasAttribute("data-unrolled")).toBe(false);
    fire(content, "animationend", "collapsible-down");
    expect(content.hasAttribute("data-unrolled")).toBe(true);
    rerender(panel(false));
    fire(content, "animationstart", "collapsible-up");
    expect(content.hasAttribute("data-unrolled")).toBe(false);
    // Reopened as it rolls up, it unrolls from there.
    rerender(panel(true));
    fire(content, "animationcancel", "collapsible-up");
    expect(content.hasAttribute("data-unrolled")).toBe(false);
    // Hidden with what holds it as it unrolls.
    fire(content, "animationcancel", "collapsible-down");
    expect(content.hasAttribute("data-unrolled")).toBe(true);
  });
});
