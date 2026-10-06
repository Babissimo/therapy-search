// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { Unfold } from "./Unfold";

/** Times the fold of any Unfold given the class `timed`, as a browser's motion-safe classes do; jsdom times nothing otherwise. */
function timeFolds() {
  const style = document.createElement("style");
  style.textContent = ".timed { transition-duration: 200ms; }";
  document.head.append(style);
  return () => style.remove();
}

let untime: (() => void) | undefined;
afterEach(() => {
  untime?.();
  untime = undefined;
});

const box = (open: boolean, across = false) => (
  <Unfold open={open} across={across} className="timed">
    <b>Held</b>
  </Unfold>
);

describe("Unfold", () => {
  it("holds nothing while closed, out of reach, and what it is given once open", () => {
    const { container, rerender } = render(box(false));
    const outer = container.firstElementChild as HTMLElement;
    expect(outer.hasAttribute("inert")).toBe(true);
    expect(outer.className).toMatch(/\bgrid-rows-\[0fr\]/);
    expect(screen.queryByText("Held")).toBeNull();
    rerender(box(true));
    expect(outer.hasAttribute("inert")).toBe(false);
    expect(outer.className).toMatch(/\bgrid-rows-\[1fr\]/);
    screen.getByText("Held");
  });

  it("keeps what it holds, out of reach, while it folds, letting go once its own transition ends", () => {
    untime = timeFolds();
    const { container, rerender } = render(box(true));
    const outer = container.firstElementChild as HTMLElement;
    rerender(box(false));
    expect(outer.hasAttribute("inert")).toBe(true);
    // A transition within what it holds is not its own.
    fireEvent.transitionEnd(screen.getByText("Held"));
    screen.getByText("Held");
    fireEvent.transitionEnd(outer);
    expect(screen.queryByText("Held")).toBeNull();
  });

  it("lets go at once where nothing times the fold, as under reduced motion", () => {
    const { rerender } = render(box(true));
    rerender(box(false));
    expect(screen.queryByText("Held")).toBeNull();
  });

  it("keeps what it holds when opened again as it folds", () => {
    untime = timeFolds();
    const { container, rerender } = render(box(true));
    const outer = container.firstElementChild as HTMLElement;
    rerender(box(false));
    rerender(box(true));
    fireEvent.transitionEnd(outer);
    screen.getByText("Held");
  });

  it("keeps folding when its transition is replaced, and lets go when one cut short leaves nothing timed", () => {
    untime = timeFolds();
    const { container, rerender } = render(box(true));
    const outer = container.firstElementChild as HTMLElement;
    rerender(box(false));
    fireEvent(outer, new TransitionEvent("transitioncancel", { bubbles: true }));
    screen.getByText("Held");
    untime();
    untime = undefined;
    fireEvent(outer, new TransitionEvent("transitioncancel", { bubbles: true }));
    expect(screen.queryByText("Held")).toBeNull();
  });

  it("unfolds sideways within a line of text, in spans", () => {
    const { container } = render(box(true, true));
    const outer = container.firstElementChild as HTMLElement;
    expect(outer.tagName).toBe("SPAN");
    expect(outer.firstElementChild?.tagName).toBe("SPAN");
    expect(outer.className).toMatch(/\bgrid-cols-\[1fr\]/);
  });

  it("across, is never squeezed narrower than its track, so a crowded line can't clip what it holds", () => {
    const { container } = render(box(true, true));
    expect((container.firstElementChild as HTMLElement).className).toMatch(/\bmin-w-max\b/);
  });
});
