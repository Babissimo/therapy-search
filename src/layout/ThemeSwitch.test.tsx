// @vitest-environment jsdom
import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, onTestFinished, vi } from "vitest";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeSwitch } from "./ThemeSwitch";

let systemDark = false;
let reducedMotion = false;
const listeners = new Set<() => void>();

function setSystemDark(dark: boolean) {
  systemDark = dark;
  act(() => listeners.forEach((l) => l()));
}

beforeEach(() => {
  vi.stubGlobal("matchMedia", (query: string) => ({
    get matches() {
      return query === "(prefers-reduced-motion: reduce)" ? reducedMotion : systemDark;
    },
    addEventListener: (_: string, l: () => void) => listeners.add(l),
    removeEventListener: (_: string, l: () => void) => listeners.delete(l),
  }));
});

afterEach(() => {
  vi.unstubAllGlobals();
  listeners.clear();
  systemDark = false;
  reducedMotion = false;
  localStorage.clear();
  document.documentElement.classList.remove("dark");
});

const renderSwitch = () =>
  render(
    <TooltipProvider>
      <ThemeSwitch />
    </TooltipProvider>,
  );
const isDark = () => document.documentElement.classList.contains("dark");

describe("ThemeSwitch", () => {
  it("starts on the stored choice", () => {
    localStorage.setItem("theme", "dark");
    renderSwitch();
    expect(screen.getByRole<HTMLInputElement>("radio", { name: "Dark" }).checked).toBe(true);
    expect(isDark()).toBe(true);
  });

  it("follows the system until light or dark is picked, and remembers the pick", () => {
    renderSwitch();
    expect(screen.getByRole<HTMLInputElement>("radio", { name: "System" }).checked).toBe(true);

    setSystemDark(true);
    expect(isDark()).toBe(true);

    fireEvent.click(screen.getByRole("radio", { name: "Light" }));
    expect(isDark()).toBe(false);
    expect(localStorage.getItem("theme")).toBe("light");

    setSystemDark(false);
    setSystemDark(true);
    expect(isDark()).toBe(false);
  });

  it("forgets the pick on returning to system", () => {
    localStorage.setItem("theme", "light");
    systemDark = true;
    renderSwitch();

    fireEvent.click(screen.getByRole("radio", { name: "System" }));
    expect(isDark()).toBe(true);
    expect(localStorage.getItem("theme")).toBeNull();
  });

  it("cross-fades into a pick, changing the page only once the fade has captured it as it was", () => {
    const start = withViewTransitions();
    renderSwitch();
    fireEvent.click(screen.getByRole("radio", { name: "Dark" }));
    expect(isDark()).toBe(false);
    act(() => start.mock.calls[0]![0]());
    expect(isDark()).toBe(true);
    expect(screen.getByRole<HTMLInputElement>("radio", { name: "Dark" }).checked).toBe(true);
  });

  it("changes at once, without the fade, under reduced motion", () => {
    reducedMotion = true;
    const start = withViewTransitions();
    renderSwitch();
    fireEvent.click(screen.getByRole("radio", { name: "Dark" }));
    expect(isDark()).toBe(true);
    expect(start).not.toHaveBeenCalled();
  });
});

/** Gives jsdom the browser's view transitions, whose update a test runs itself, each skipped as in a hidden tab. */
function withViewTransitions() {
  const start = vi.fn((_update: () => void) => ({ ready: Promise.reject(new DOMException("Skipped", "InvalidStateError")) }));
  Object.defineProperty(document, "startViewTransition", { configurable: true, value: start });
  onTestFinished(() => void Reflect.deleteProperty(document, "startViewTransition"));
  return start;
}
