// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, renderHook, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TooltipProvider } from "@/components/ui/tooltip";
import { LazyShortlistTab, usePreloadShortlistTab } from "./LazyShortlistTab";
import { createShortlistStore } from "./store";
import { ShortlistContext } from "./useShortlist";

function renderTab(Tab: typeof LazyShortlistTab) {
  const store = createShortlistStore(null, () => 1000);
  store.add({ slug: "Jo-ABCDEFGH", name: "Jo Bloggs", initials: "JB", tags: [] });
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <ShortlistContext.Provider value={store}>
        <TooltipProvider>
          <MemoryRouter>
            <Tab sought={new Set()} />
          </MemoryRouter>
        </TooltipProvider>
      </ShortlistContext.Provider>
    </QueryClientProvider>,
  );
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
    // The chunk's first import outlasts a findBy's one-second wait under load; a lazy tab still draws empty before it.
    await import("./ShortlistTab");
    const { container } = renderTab(LazyShortlistTab);
    expect(container.textContent).toBe("");
    expect(await screen.findByRole("heading", { name: "Jo Bloggs" })).toBeTruthy();
  });

  it("says so in the tab, and leaves the page standing, when its chunk can't be fetched", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.doMock("./ShortlistTab", () => Promise.reject(new TypeError("Failed to fetch dynamically imported module")));
    vi.resetModules();
    const { LazyShortlistTab: Failing } = await import("./LazyShortlistTab");
    renderTab(Failing);
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
