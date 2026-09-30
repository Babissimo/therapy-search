// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ShortlistButton } from "./ShortlistButton";
import { createShortlistStore, type ShortlistCard, type ShortlistStore } from "./store";
import { ShortlistContext } from "./useShortlist";

const JO: ShortlistCard = { slug: "Jo-ABCDEFGH", name: "Jo Bloggs", initials: "JB", tags: [] };

function renderButton(seed?: (store: ShortlistStore) => void) {
  let t = 5000;
  const store = createShortlistStore(null, () => t++);
  seed?.(store);
  render(
    <ShortlistContext.Provider value={store}>
      <TooltipProvider>
        <ShortlistButton therapist={JO} />
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

  it("puts a therapist it removed back in the place and with the card they had", () => {
    const store = renderButton((seeded) => {
      seeded.add({ ...JO, summary: "Summary text." }, 42);
      seeded.add({ slug: "Al-ABCDEFGH", name: "Al Bloggs", initials: "AB", tags: [] }, 43);
    });
    const before = store.get();
    fireEvent.click(screen.getByRole("button", { name: "Remove Jo Bloggs from your shortlist" }));
    fireEvent.click(screen.getByRole("button", { name: "Add Jo Bloggs to your shortlist" }));
    expect(store.get()).toEqual(before);
  });
});
