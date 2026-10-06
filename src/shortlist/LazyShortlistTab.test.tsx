// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, renderHook, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TooltipProvider } from "@/components/ui/tooltip";
import { usePreloadShortlistTab } from "./LazyShortlistTab";

/** The tab's module as a page load first meets it, its chunk not yet asked for, with a way to draw the tab over a store of its own. */
async function freshTab() {
  vi.resetModules();
  const { LazyShortlistTab, loadShortlistTab } = await import("./LazyShortlistTab");
  // The store and its context as the freshly loaded tab reads them.
  const { createShortlistStore } = await import("./store");
  const { ShortlistContext } = await import("./useShortlist");
  const store = createShortlistStore(null, () => 1000);
  store.add({ slug: "Jo-ABCDEFGH", name: "Jo Bloggs", initials: "JB", tags: [] });
  const draw = () =>
    render(
      <QueryClientProvider client={new QueryClient()}>
        <ShortlistContext.Provider value={store}>
          <TooltipProvider>
            <MemoryRouter>
              <LazyShortlistTab sought={new Set()} />
            </MemoryRouter>
          </TooltipProvider>
        </ShortlistContext.Provider>
      </QueryClientProvider>,
    );
  return { draw, loadShortlistTab };
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.doUnmock("./ShortlistTab");
  vi.resetModules();
});

describe("LazyShortlistTab", () => {
  it("draws nothing in the tab until its chunk is here, then the shortlist", async () => {
    const { draw } = await freshTab();
    // The chunk's first import outlasts a findBy's one-second wait under load; a lazy tab still draws empty before it.
    await import("./ShortlistTab");
    const { container } = draw();
    expect(container.textContent).toBe("");
    expect(await screen.findByRole("heading", { name: "Jo Bloggs" })).toBeTruthy();
  });

  it("draws the shortlist as the tab opens once its chunk has been fetched", async () => {
    const { draw, loadShortlistTab } = await freshTab();
    await loadShortlistTab();
    draw();
    expect(screen.getByRole("heading", { name: "Jo Bloggs" })).toBeTruthy();
  });

  it("says so in the tab, and leaves the page standing, when its chunk can't be fetched", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.doMock("./ShortlistTab", () => Promise.reject(new TypeError("Failed to fetch dynamically imported module")));
    const { draw } = await freshTab();
    draw();
    expect(await screen.findByText(/^Your shortlist couldn't be shown just now/)).toBeTruthy();
  });
});

describe("usePreloadShortlistTab", () => {
  it("asks for the chunk once the browser is idle, and no longer once the page has gone", () => {
    const requestIdleCallback = vi.fn((_: IdleRequestCallback, __?: IdleRequestOptions) => 7);
    const cancelIdleCallback = vi.fn();
    vi.stubGlobal("requestIdleCallback", requestIdleCallback);
    vi.stubGlobal("cancelIdleCallback", cancelIdleCallback);
    const { unmount } = renderHook(usePreloadShortlistTab);
    expect(requestIdleCallback).toHaveBeenCalledOnce();
    unmount();
    expect(cancelIdleCallback).toHaveBeenCalledWith(7);
  });

  it("waits a second instead where the browser has no idle callback", () => {
    vi.useFakeTimers();
    const { unmount } = renderHook(usePreloadShortlistTab);
    expect(vi.getTimerCount()).toBe(1);
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
});
