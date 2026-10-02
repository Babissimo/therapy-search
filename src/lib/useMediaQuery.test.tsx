// @vitest-environment jsdom
import { act, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useMediaQuery } from "./useMediaQuery";

function Probe() {
  return <output>{useMediaQuery("(min-width: 64rem)") ? "wide" : "narrow"}</output>;
}

afterEach(() => vi.unstubAllGlobals());

/** A window as wide as `media.wide` says, printing while `media.print` does; `change` tells listeners either has changed. */
function stubMedia() {
  const media = { wide: false, print: false };
  const listeners = new Set<() => void>();
  vi.stubGlobal("matchMedia", (query: string) => ({
    get matches() {
      return query === "print" ? media.print : media.wide;
    },
    addEventListener: (_: string, listener: () => void) => listeners.add(listener),
    removeEventListener: (_: string, listener: () => void) => listeners.delete(listener),
  }));
  return { media, change: () => act(() => listeners.forEach((listener) => listener())) };
}

describe("useMediaQuery", () => {
  it("follows the query as the window changes", () => {
    const { media, change } = stubMedia();
    render(<Probe />);
    expect(screen.getByRole("status").textContent).toBe("narrow");
    media.wide = true;
    change();
    expect(screen.getByRole("status").textContent).toBe("wide");
  });

  it("keeps the screen's answer while the page prints at the paper's width, and follows the screen again after", () => {
    const { media, change } = stubMedia();
    media.wide = true;
    render(<Probe />);
    media.print = true;
    media.wide = false;
    change();
    expect(screen.getByRole("status").textContent).toBe("wide");
    media.print = false;
    change();
    expect(screen.getByRole("status").textContent).toBe("narrow");
  });

  it("reads as not matching where the browser can't tell", () => {
    render(<Probe />);
    expect(screen.getByRole("status").textContent).toBe("narrow");
  });
});
