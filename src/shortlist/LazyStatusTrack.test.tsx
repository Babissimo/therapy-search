// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TooltipProvider } from "@/components/ui/tooltip";
import { LazyStatusTrack } from "./LazyStatusTrack";
import { createShortlistStore, type ShortlistCard } from "./store";
import { ShortlistContext } from "./useShortlist";

const JO: ShortlistCard = { slug: "Jo-ABCDEFGH", name: "Jo Bloggs", initials: "JB", tags: [] };

function renderTrack(Track: typeof LazyStatusTrack) {
  const store = createShortlistStore(null, () => 1000);
  store.add(JO, { status: "contacted" });
  return render(
    <ShortlistContext.Provider value={store}>
      <TooltipProvider>
        <Track therapist={JO} status="contacted" />
      </TooltipProvider>
    </ShortlistContext.Provider>,
  );
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.doUnmock("./StatusTrack");
  vi.resetModules();
});

describe("LazyStatusTrack", () => {
  it("draws nothing until its chunk is here, then the track", async () => {
    const { container } = renderTrack(LazyStatusTrack);
    expect(container.textContent).toBe("");
    expect(await screen.findByRole("list", { name: "Steps with Jo Bloggs" })).toBeTruthy();
  });

  it("says so in its place, and leaves the page standing, when its chunk can't be fetched", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.doMock("./StatusTrack", () => Promise.reject(new TypeError("Failed to fetch dynamically imported module")));
    vi.resetModules();
    const { LazyStatusTrack: Failing } = await import("./LazyStatusTrack");
    renderTrack(Failing);
    expect(await screen.findByText(/^Where you stand with Jo Bloggs couldn't be shown just now/)).toBeTruthy();
  });
});
