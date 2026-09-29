// @vitest-environment jsdom
import { act, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { useDarkTheme } from "./useDarkTheme";

function Probe() {
  return <output>{useDarkTheme() ? "dark" : "light"}</output>;
}

afterEach(() => document.documentElement.classList.remove("dark"));

describe("useDarkTheme", () => {
  it("follows the theme switch's class on the page", async () => {
    render(<Probe />);
    expect(screen.getByRole("status").textContent).toBe("light");
    // The class change reaches the hook through a MutationObserver, which reports in a microtask.
    await act(async () => {
      document.documentElement.classList.add("dark");
    });
    expect(screen.getByRole("status").textContent).toBe("dark");
  });
});
