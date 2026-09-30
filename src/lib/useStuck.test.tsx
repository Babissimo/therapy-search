// @vitest-environment jsdom
import { act, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useStuck } from "./useStuck";

function Probe() {
  const [ref, stuck] = useStuck();
  return (
    <header ref={ref}>
      <output>{stuck ? "stuck" : "unstuck"}</output>
    </header>
  );
}

type Callback = (entries: Partial<IntersectionObserverEntry>[]) => void;

type Observer = { callback: Callback; disconnected: boolean };

/** Stands in for the browser's observer, giving the one made last. */
function stubObserver(): () => Observer {
  const observers: Observer[] = [];
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      observer: Observer;
      constructor(callback: Callback) {
        this.observer = { callback, disconnected: false };
        observers.push(this.observer);
      }
      observe() {}
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

  it("isn't stuck when clipped at a side only, as while a drawer slides in", () => {
    const observer = stubObserver();
    render(<Probe />);
    act(() => observer().callback([{ ...entry(0, 0), intersectionRatio: 0.5 }]));
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
  });
});
