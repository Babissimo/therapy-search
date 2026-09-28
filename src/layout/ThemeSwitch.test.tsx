// @vitest-environment jsdom
import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeSwitch } from "./ThemeSwitch";

let systemDark = false;
const listeners = new Set<() => void>();

function setSystemDark(dark: boolean) {
  systemDark = dark;
  act(() => listeners.forEach((l) => l()));
}

beforeEach(() => {
  vi.stubGlobal("matchMedia", () => ({
    get matches() {
      return systemDark;
    },
    addEventListener: (_: string, l: () => void) => listeners.add(l),
    removeEventListener: (_: string, l: () => void) => listeners.delete(l),
  }));
});

afterEach(() => {
  vi.unstubAllGlobals();
  listeners.clear();
  systemDark = false;
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
});
