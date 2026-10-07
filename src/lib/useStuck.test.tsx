// @vitest-environment jsdom
import { act, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useStuck } from "./useStuck";

function Probe({ sticky = true }: { sticky?: boolean }) {
  const [ref, stuck] = useStuck();
  return (
    <header ref={ref} style={sticky ? { position: "sticky" } : undefined}>
      <output>{stuck ? "stuck" : "unstuck"}</output>
    </header>
  );
}

type Callback = (entries: Partial<IntersectionObserverEntry>[]) => void;

type Observer = { callback: Callback; options?: IntersectionObserverInit; observed: number; disconnected: boolean };

/** Stands in for the browser's observer, giving the one made last. */
function stubObserver(): () => Observer {
  const observers: Observer[] = [];
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      observer: Observer;
      constructor(callback: Callback, options?: IntersectionObserverInit) {
        this.observer = { callback, options, observed: 0, disconnected: false };
        observers.push(this.observer);
      }
      observe() {
        this.observer.observed++;
      }
      unobserve() {}
      disconnect() {
        this.observer.disconnected = true;
      }
    },
  );
  return () => observers.at(-1)!;
}

/** An entry for a header whose top is at `top`, seen by its scroller from `clippedTo` down. */
const entry = (top: number, clippedTo: number) => ({
  boundingClientRect: { top } as DOMRectReadOnly,
  intersectionRect: { top: clippedTo } as DOMRectReadOnly,
});

afterEach(() => vi.unstubAllGlobals());

describe("useStuck", () => {
  it("sticks once its scroller clips the pixel above it, and comes unstuck once it shows whole again", () => {
    const observer = stubObserver();
    render(<Probe />);
    expect(screen.getByRole("status").textContent).toBe("unstuck");
    act(() => observer().callback([entry(-1, 0)]));
    expect(screen.getByRole("status").textContent).toBe("stuck");
    act(() => observer().callback([entry(0, 0)]));
    expect(screen.getByRole("status").textContent).toBe("unstuck");
  });

  it("counts a window's height below the window as in view, to be told it has stuck though its foot started out of sight", () => {
    const observer = stubObserver();
    render(<Probe />);
    expect(observer().options).toEqual({ threshold: 1, rootMargin: "0px 0px 100% 0px" });
  });

  it("isn't stuck when clipped at a side only, as while a drawer slides in", () => {
    const observer = stubObserver();
    render(<Probe />);
    act(() => observer().callback([{ ...entry(0, 0), intersectionRatio: 0.5 }]));
    expect(screen.getByRole("status").textContent).toBe("unstuck");
  });

  it("isn't stuck while it isn't sticky, however far it has scrolled", () => {
    const observer = stubObserver();
    render(<Probe sticky={false} />);
    act(() => observer().callback([entry(-50, 0)]));
    expect(screen.getByRole("status").textContent).toBe("unstuck");
  });

  it("looks again on a resize, which can make it sticky or not with nothing crossing into or out of view", () => {
    const observer = stubObserver();
    const { rerender } = render(<Probe />);
    act(() => observer().callback([entry(-1, 0)]));
    rerender(<Probe sticky={false} />);
    act(() => window.dispatchEvent(new Event("resize")));
    expect(observer().observed).toBe(2);
    // What the observer reports on watching it anew.
    act(() => observer().callback([entry(-20, 0)]));
    expect(screen.getByRole("status").textContent).toBe("unstuck");
  });

  it("goes by the latest of the changes reported together", () => {
    const observer = stubObserver();
    render(<Probe />);
    act(() => observer().callback([entry(0, 0), entry(-1, 0)]));
    expect(screen.getByRole("status").textContent).toBe("stuck");
  });

  it("stops watching once its element goes", () => {
    const observer = stubObserver();
    const { unmount } = render(<Probe />);
    unmount();
    expect(observer().disconnected).toBe(true);
    window.dispatchEvent(new Event("resize"));
    expect(observer().observed).toBe(1);
  });
});
