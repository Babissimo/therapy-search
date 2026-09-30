// @vitest-environment jsdom
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { describe, expect, it } from "vitest";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ShortlistTab } from "./ShortlistTab";
import { createShortlistStore, type ShortlistCard } from "./store";
import { ShortlistContext } from "./useShortlist";

const card = (slug: string, name: string): ShortlistCard => ({
  slug,
  name,
  initials: "XX",
  location: "Leeds LS1",
  summary: `About ${name}.`,
  tags: ["Anxiety", "Grief"],
});

function renderTab(sought: string[], ...cards: ShortlistCard[]) {
  let t = 1000;
  const store = createShortlistStore(null, () => t++);
  for (const c of cards) store.add(c);
  render(
    <ShortlistContext.Provider value={store}>
      <TooltipProvider>
        <MemoryRouter>
          <ShortlistTab sought={new Set(sought)} />
        </MemoryRouter>
      </TooltipProvider>
    </ShortlistContext.Provider>,
  );
  return store;
}

const names = () => screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent);

describe("ShortlistTab", () => {
  it("says how to shortlist someone when the list is empty", () => {
    renderTab([]);
    screen.getByText(/^Nothing shortlisted yet/);
  });

  it("lists shortlisted therapists newest first, each linking to their profile", () => {
    renderTab([], card("Ann-AAAAAAAA", "Ann"), card("Bo-BBBBBBBB", "Bo"));
    expect(names()).toEqual(["Bo", "Ann"]);
    expect(screen.getByRole("link", { name: "Ann" }).getAttribute("href")).toBe("/therapist/Ann-AAAAAAAA");
    screen.getByText("2 therapists, kept in this browser only.");
    screen.getByText("About Ann.");
  });

  it("picks out the tags the search asked for, as the results do", () => {
    renderTab(["grief"], card("Ann-AAAAAAAA", "Ann"));
    screen.getByText("Grief");
    expect(screen.queryByText("Anxiety")).toBeNull();
  });

  it("keeps a removed therapist in place, dimmed, until they are added back", () => {
    const store = renderTab([], card("Ann-AAAAAAAA", "Ann"), card("Bo-BBBBBBBB", "Bo"), card("Cy-CCCCCCCC", "Cy"));
    fireEvent.click(screen.getByRole("button", { name: "Remove Bo from your shortlist" }));
    expect(store.has("Bo-BBBBBBBB")).toBe(false);
    expect(names()).toEqual(["Cy", "Bo", "Ann"]);
    const entry = () => screen.getByRole("heading", { name: "Bo" }).closest("li");
    expect(entry()?.className).toMatch(/opacity-60/);
    screen.getByText("2 therapists, kept in this browser only.");
    fireEvent.click(screen.getByRole("button", { name: "Add Bo to your shortlist" }));
    expect(store.get().map((e) => e.card.name)).toEqual(["Cy", "Bo", "Ann"]);
    expect(entry()?.className).not.toMatch(/opacity-60/);
  });

  it("shows therapists shortlisted in another tab while it is open", () => {
    const store = renderTab([], card("Ann-AAAAAAAA", "Ann"));
    act(() => store.add(card("Bo-BBBBBBBB", "Bo")));
    expect(names()).toEqual(["Bo", "Ann"]);
    within(screen.getByRole("list")).getByRole("link", { name: "Bo" });
  });
});
