// @vitest-environment jsdom
import { act, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useMediaQuery } from "./useMediaQuery";

function Probe() {
  return <output>{useMediaQuery("(min-width: 64rem)") ? "wide" : "narrow"}</output>;
}

afterEach(() => vi.unstubAllGlobals());

describe("useMediaQuery", () => {
  it("follows the query as the window changes", () => {
    let matches = false;
    const listeners = new Set<() => void>();
    vi.stubGlobal("matchMedia", () => ({
      get matches() {
        return matches;
      },
      addEventListener: (_: string, listener: () => void) => listeners.add(listener),
      removeEventListener: (_: string, listener: () => void) => listeners.delete(listener),
    }));
    render(<Probe />);
    expect(screen.getByRole("status").textContent).toBe("narrow");
    matches = true;
    act(() => listeners.forEach((listener) => listener()));
    expect(screen.getByRole("status").textContent).toBe("wide");
  });

  it("reads as not matching where the browser can't tell", () => {
    render(<Probe />);
    expect(screen.getByRole("status").textContent).toBe("narrow");
  });
});
