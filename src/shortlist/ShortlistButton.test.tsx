// @vitest-environment jsdom
import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, onTestFinished } from "vitest";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ShortlistButton } from "./ShortlistButton";
import { createShortlistStore, SHORTLIST_KEY, type ShortlistCard, type ShortlistStore } from "./store";
import { ShortlistContext } from "./useShortlist";

const JO: ShortlistCard = { slug: "Jo-ABCDEFGH", name: "Jo Bloggs", initials: "JB", tags: [] };

function clockedStore(storage: Storage | null, events?: EventTarget) {
  let t = 5000;
  return createShortlistStore(storage, () => t++, events);
}

function renderButton(seed?: (store: ShortlistStore) => void, store = clockedStore(null)) {
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
      seeded.add({ ...JO, summary: "Summary text." }, { addedAt: 42 });
      seeded.add({ slug: "Al-ABCDEFGH", name: "Al Bloggs", initials: "AB", tags: [] }, { addedAt: 43 });
      seeded.move(JO.slug, { below: seeded.get()[0] });
    });
    expect(store.get().map((e) => e.card.name)).toEqual(["Jo Bloggs", "Al Bloggs"]);
    const before = store.get();
    fireEvent.click(screen.getByRole("button", { name: "Remove Jo Bloggs from your shortlist" }));
    fireEvent.click(screen.getByRole("button", { name: "Add Jo Bloggs to your shortlist" }));
    expect(store.get()).toEqual(before);
  });

  it("adds a therapist afresh, with the card it shows, once the shortlist is cleared, forgetting where the visitor stood with them", () => {
    const store = renderButton((seeded) => {
      seeded.add({ ...JO, summary: "Summary from before." });
      seeded.setStatus(JO.slug, "seeing");
    });
    act(() => store.clear());
    fireEvent.click(screen.getByRole("button", { name: "Add Jo Bloggs to your shortlist" }));
    expect(store.get()).toEqual([{ addedAt: 5001, card: JO }]);
  });

  it("forgets where the visitor stood with a therapist it removed once another tab clears the list", () => {
    onTestFinished(() => localStorage.clear());
    const store = renderButton(
      (seeded) => {
        seeded.add(JO);
        seeded.setStatus(JO.slug, "seeing");
      },
      clockedStore(localStorage, window),
    );
    fireEvent.click(screen.getByRole("button", { name: "Remove Jo Bloggs from your shortlist" }));
    // Another tab's clear, as this one hears it.
    localStorage.removeItem(SHORTLIST_KEY);
    act(() => void window.dispatchEvent(new StorageEvent("storage", { key: SHORTLIST_KEY, newValue: null })));
    fireEvent.click(screen.getByRole("button", { name: "Add Jo Bloggs to your shortlist" }));
    expect(store.get()).toEqual([{ addedAt: 5001, card: JO }]);
  });
});
