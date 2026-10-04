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

  it("says what a press does on a touch screen, in the first word of its name, beside the therapist's own", () => {
    renderButton();
    // The words a touch screen shows, which a tooltip names elsewhere.
    const shown = (name: string) =>
      [...screen.getByRole("button", { name }).querySelectorAll(".pointer-coarse\\:not-sr-only")].map((span) => span.textContent);
    expect(shown("Add Jo Bloggs to your shortlist")).toEqual(["Add"]);
    fireEvent.click(screen.getByRole("button", { name: "Add Jo Bloggs to your shortlist" }));
    expect(shown("Remove Jo Bloggs from your shortlist")).toEqual(["Remove"]);
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

  it("puts back where and as they were a therapist removed before it was drawn, as on a profile opened later", () => {
    const store = clockedStore(null);
    store.add({ ...JO, summary: "Summary text." });
    store.setStatus(JO.slug, "consultation");
    store.setNote(JO.slug, "Rang on Tuesday");
    const before = store.get();
    store.remove(JO.slug);
    renderButton(undefined, store);
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
    // The clock read 5001 as the press removed them.
    expect(store.get()).toEqual([{ addedAt: 5002, card: JO }]);
  });

  it("says what each press did, and says it again once something else has undone it", () => {
    const store = renderButton();
    // There before the first press, as a screen reader reads out only changes to a region it knows.
    const region = document.querySelector("[aria-live=polite]")!;
    expect(region.textContent).toBe("");
    fireEvent.click(screen.getByRole("button", { name: "Add Jo Bloggs to your shortlist" }));
    expect(region.textContent).toBe("Added Jo Bloggs to your shortlist.");
    fireEvent.click(screen.getByRole("button", { name: "Remove Jo Bloggs from your shortlist" }));
    expect(region.textContent).toBe("Removed Jo Bloggs from your shortlist.");
    // Added back by another tab, say.
    act(() => store.add(JO));
    expect(region.textContent).toBe("");
    fireEvent.click(screen.getByRole("button", { name: "Remove Jo Bloggs from your shortlist" }));
    expect(region.textContent).toBe("Removed Jo Bloggs from your shortlist.");
  });
});
