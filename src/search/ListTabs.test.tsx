// @vitest-environment jsdom
import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, onTestFinished } from "vitest";
import { Tabs } from "@/components/ui/tabs";
import { createShortlistStore, type ShortlistCard, type ShortlistStore } from "@/shortlist/store";
import { ShortlistContext } from "@/shortlist/useShortlist";
import { ListTabs } from "./ListTabs";

const card = (slug: string, name: string): ShortlistCard => ({ slug, name, initials: "XX", tags: [] });

function renderTabs(store: ShortlistStore) {
  render(
    <ShortlistContext.Provider value={store}>
      <Tabs value="results">
        <ListTabs />
      </Tabs>
    </ShortlistContext.Provider>,
  );
}

describe("ListTabs", () => {
  it("unfolds the shortlist's count beside its name as the first therapist is listed, and folds it away as the last goes", () => {
    // As a browser times the fold; jsdom times nothing otherwise.
    const style = document.createElement("style");
    style.textContent = "[role=tab] .grid { transition-duration: 200ms; }";
    document.head.append(style);
    onTestFinished(() => style.remove());
    const store = createShortlistStore(null);
    renderTabs(store);
    const tab = screen.getByRole("tab", { name: "Shortlist" });
    const fold = tab.querySelector<HTMLElement>(".grid")!;
    expect(fold.hasAttribute("inert")).toBe(true);
    expect(fold.textContent).toBe("");
    act(() => store.add(card("Ann-AAAAAAAA", "Ann")));
    expect(fold.hasAttribute("inert")).toBe(false);
    screen.getByRole("tab", { name: "Shortlist, 1 therapist" });
    act(() => store.add(card("Bo-BBBBBBBB", "Bo")));
    screen.getByRole("tab", { name: "Shortlist, 2 therapists" });
    act(() => store.remove("Bo-BBBBBBBB"));
    act(() => store.setStatus("Ann-AAAAAAAA", "setAside"));
    // Folding, it shows the count it last had, out of reach, until the fold ends.
    expect(fold.hasAttribute("inert")).toBe(true);
    expect(fold.textContent).toBe("1, 1 therapist");
    fireEvent.transitionEnd(fold);
    expect(fold.textContent).toBe("");
  });

  it("names the tab without a count where nothing times the fold", () => {
    const store = createShortlistStore(null);
    store.add(card("Ann-AAAAAAAA", "Ann"));
    renderTabs(store);
    screen.getByRole("tab", { name: "Shortlist, 1 therapist" });
    act(() => store.remove("Ann-AAAAAAAA"));
    screen.getByRole("tab", { name: "Shortlist" });
  });
});
