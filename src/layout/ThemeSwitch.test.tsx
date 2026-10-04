// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { compile } from "tailwindcss";
import { afterEach, beforeEach, describe, expect, it, onTestFinished, vi } from "vitest";
import { TooltipProvider } from "@/components/ui/tooltip";

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
      if (query === "(prefers-reduced-motion: reduce)") return reducedMotion;
      return query === "(prefers-color-scheme: dark)" && systemDark;
    },
    addEventListener: (_: string, l: () => void) => listeners.add(l),
    removeEventListener: (_: string, l: () => void) => listeners.delete(l),
  }));
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.resetModules();
  listeners.clear();
  systemDark = false;
  reducedMotion = false;
  localStorage.clear();
  document.documentElement.classList.remove("dark");
});

/** Draws the switch, imported afresh in each test so it reads storage as a page load does. */
async function renderSwitch() {
  const { ThemeSwitch } = await import("./ThemeSwitch");
  return render(
    <TooltipProvider>
      <ThemeSwitch />
    </TooltipProvider>,
  );
}
const isDark = () => document.documentElement.classList.contains("dark");

describe("ThemeSwitch", () => {
  it("starts on the stored choice", async () => {
    localStorage.setItem("theme", "dark");
    await renderSwitch();
    expect(screen.getByRole<HTMLInputElement>("radio", { name: "Dark" }).checked).toBe(true);
    expect(isDark()).toBe(true);
  });

  it("follows the system until light or dark is picked, and remembers the pick", async () => {
    await renderSwitch();
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

  it("widens each choice to a touch target's width on a touch screen, and stands its target on it", async () => {
    await renderSwitch();
    for (const name of ["Light", "System", "Dark"]) {
      const { classList } = screen.getByRole("radio", { name }).closest("label")!;
      expect(["pointer-coarse:w-11", "touch-target", "relative"].map((c) => classList.contains(c))).toEqual([true, true, true]);
    }
  });

  it("draws the chosen theme and keyboard focus from the radio's own state, without :has, which Firefox lacks before 121", async () => {
    await renderSwitch();
    const classes: string[] = [];
    for (const name of ["Light", "System", "Dark"]) {
      const radio = screen.getByRole("radio", { name });
      expect(radio.classList.contains("peer")).toBe(true);
      // A later sibling, which is all a peer variant reaches.
      expect(radio.nextElementSibling?.classList.contains("peer-checked:bg-muted")).toBe(true);
      const label = radio.closest("label")!;
      classes.push(...[label, ...label.querySelectorAll("*")].flatMap((element) => [...element.classList]));
    }
    const css = await compiled(classes);
    expect(css).not.toContain(":has(");
    // The rule holding each declaration, by its selector.
    const selector = (declaration: string) => css.match(new RegExp(`([^{}]+)\\{[^{}]*${declaration.replace(/[()]/g, "\\$&")}`))?.[1]?.trim();
    expect(selector("background-color: var(--color-muted)")).toContain(":where(.peer):checked ~ *");
    expect(selector("background-color: Highlight")).toContain(":where(.peer):checked ~ *");
    expect(selector("outline-width: 2px")).toContain(":where(.peer):focus-visible ~ *");
    expect(selector("outline-color: Highlight")).toContain(":where(.peer):focus-visible ~ *");
  });

  it("forgets the pick on returning to system", async () => {
    localStorage.setItem("theme", "light");
    systemDark = true;
    await renderSwitch();

    fireEvent.click(screen.getByRole("radio", { name: "System" }));
    expect(isDark()).toBe(true);
    expect(localStorage.getItem("theme")).toBeNull();
  });

  it("cross-fades into a pick, changing the page only once the fade has captured it as it was", async () => {
    const start = withViewTransitions();
    await renderSwitch();
    fireEvent.click(screen.getByRole("radio", { name: "Dark" }));
    expect(isDark()).toBe(false);
    act(() => start.mock.calls[0]![0]());
    expect(isDark()).toBe(true);
    expect(screen.getByRole<HTMLInputElement>("radio", { name: "Dark" }).checked).toBe(true);
  });

  it("changes at once, without the fade, under reduced motion", async () => {
    reducedMotion = true;
    const start = withViewTransitions();
    await renderSwitch();
    fireEvent.click(screen.getByRole("radio", { name: "Dark" }));
    expect(isDark()).toBe(true);
    expect(start).not.toHaveBeenCalled();
  });

  it.each([
    ["refuses writes", () => vi.spyOn(Storage.prototype, "setItem")],
    ["is out of reach", () => vi.spyOn(window, "localStorage", "get")],
  ])("keeps a pick for the page load when storage %s, as the masthead is drawn afresh", async (_, spyOn) => {
    spyOn().mockImplementation(() => {
      throw new DOMException("denied", "SecurityError");
    });
    const { unmount } = await renderSwitch();
    fireEvent.click(screen.getByRole("radio", { name: "Dark" }));
    unmount();
    await renderSwitch();
    expect(screen.getByRole<HTMLInputElement>("radio", { name: "Dark" }).checked).toBe(true);
    expect(isDark()).toBe(true);
  });
});

/** The CSS Tailwind writes for `classes`, with index.css's forced-chosen utility and the theme's colours they use. */
async function compiled(classes: string[]): Promise<string> {
  const source = readFileSync(`${import.meta.dirname}/../index.css`, "utf8");
  const chosen = source.match(/@utility forced-chosen \{\n[\s\S]*?\n\}\n/)?.[0];
  if (!chosen) throw new Error("index.css has no forced-chosen utility");
  const theme = "@theme { --spacing: 0.25rem; --color-muted: #eee; --color-foreground: #111; --color-muted-foreground: #666; }";
  return (await compile(`${theme}\n@tailwind utilities;\n${chosen}`)).build(classes);
}

/** Gives jsdom the browser's view transitions, whose update a test runs itself, each skipped as in a hidden tab. */
function withViewTransitions() {
  const start = vi.fn((_update: () => void) => ({ ready: Promise.reject(new DOMException("Skipped", "InvalidStateError")) }));
  Object.defineProperty(document, "startViewTransition", { configurable: true, value: start });
  onTestFinished(() => void Reflect.deleteProperty(document, "startViewTransition"));
  return start;
}
