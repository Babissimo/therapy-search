// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ShortlistButton } from "./ShortlistButton";
import { createShortlistStore, type ShortlistCard } from "./store";
import { ShortlistContext } from "./useShortlist";

const JO: ShortlistCard = { slug: "Jo-ABCDEFGH", name: "Jo Bloggs", initials: "JB", tags: [] };

function renderButton(addedAt?: number) {
  let t = 5000;
  const store = createShortlistStore(null, () => t++);
  render(
    <ShortlistContext.Provider value={store}>
      <TooltipProvider>
        <ShortlistButton therapist={JO} addedAt={addedAt} />
      </TooltipProvider>
    </ShortlistContext.Provider>,
  );
  return store;
}

describe("ShortlistButton", () => {
  it("adds the therapist, then removes them", () => {
    const store = renderButton();
    fireEvent.click(screen.getByRole("button", { name: "Add Jo Bloggs to your shortlist" }));
    expect(store.get()).toEqual([{ addedAt: 5000, card: JO }]);
    fireEvent.click(screen.getByRole("button", { name: "Remove Jo Bloggs from your shortlist" }));
    expect(store.get()).toEqual([]);
  });

  it("puts a therapist back at the time they were first added", () => {
    const store = renderButton(42);
    fireEvent.click(screen.getByRole("button", { name: "Add Jo Bloggs to your shortlist" }));
    expect(store.get()[0]?.addedAt).toBe(42);
  });
});
