// @vitest-environment jsdom
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import type { ComponentProps } from "react";
import { MemoryRouter } from "react-router";
import { describe, expect, it, vi } from "vitest";
import { TooltipProvider } from "@/components/ui/tooltip";
import type { Pin } from "@/search/map/pins";
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

type Props = Omit<ComponentProps<typeof ShortlistTab>, "sought"> & { sought?: string[] };

function renderTab({ sought = [], ...props }: Props, ...cards: ShortlistCard[]) {
  let t = 1000;
  const store = createShortlistStore(null, () => t++);
  for (const c of cards) store.add(c);
  render(
    <ShortlistContext.Provider value={store}>
      <TooltipProvider>
        <MemoryRouter>
          <ShortlistTab sought={new Set(sought)} {...props} />
        </MemoryRouter>
      </TooltipProvider>
    </ShortlistContext.Provider>,
  );
  return store;
}

const pin = (key: string, ...cards: ShortlistCard[]): Pin => ({ key, point: { lat: 51, lng: 0 }, therapists: cards, kind: "outcode" });
const entry = (name: string) => screen.getByRole("heading", { name }).closest("li");

const names = () => screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent);

describe("ShortlistTab", () => {
  it("says how to shortlist someone when the list is empty", () => {
    renderTab({});
    screen.getByText(/^Nothing shortlisted yet/);
  });

  it("lists shortlisted therapists newest first, each linking to their profile", () => {
    renderTab({}, card("Ann-AAAAAAAA", "Ann"), card("Bo-BBBBBBBB", "Bo"));
    expect(names()).toEqual(["Bo", "Ann"]);
    expect(screen.getByRole("link", { name: "Ann" }).getAttribute("href")).toBe("/therapist/Ann-AAAAAAAA");
    screen.getByText("2 therapists, kept in this browser only.");
    screen.getByText("About Ann.");
  });

  it("picks out the tags the search asked for, as the results do", () => {
    renderTab({ sought: ["grief"] }, card("Ann-AAAAAAAA", "Ann"));
    screen.getByText("Grief");
    expect(screen.queryByText("Anxiety")).toBeNull();
  });

  it("keeps a removed therapist in place, dimmed, until they are added back", () => {
    const store = renderTab({}, card("Ann-AAAAAAAA", "Ann"), card("Bo-BBBBBBBB", "Bo"), card("Cy-CCCCCCCC", "Cy"));
    fireEvent.click(screen.getByRole("button", { name: "Remove Bo from your shortlist" }));
    expect(store.has("Bo-BBBBBBBB")).toBe(false);
    expect(names()).toEqual(["Cy", "Bo", "Ann"]);
    expect(entry("Bo")?.className).toMatch(/opacity-60/);
    screen.getByText("2 therapists, kept in this browser only.");
    fireEvent.click(screen.getByRole("button", { name: "Add Bo to your shortlist" }));
    expect(store.get().map((e) => e.card.name)).toEqual(["Cy", "Bo", "Ann"]);
    expect(entry("Bo")?.className).not.toMatch(/opacity-60/);
  });

  it("shows therapists shortlisted in another tab while it is open", () => {
    const store = renderTab({}, card("Ann-AAAAAAAA", "Ann"));
    act(() => store.add(card("Bo-BBBBBBBB", "Bo")));
    expect(names()).toEqual(["Bo", "Ann"]);
    within(screen.getByRole("list")).getByRole("link", { name: "Bo" });
  });

  it("marks everyone at the pin selected on the map, whose place the page can find", () => {
    const [ann, bo, cy] = [card("Ann-AAAAAAAA", "Ann"), card("Bo-BBBBBBBB", "Bo"), card("Cy-CCCCCCCC", "Cy")];
    const here = pin("here", ann, cy);
    renderTab({ pins: [here, pin("there", bo)], selected: here }, ann, bo, cy);
    expect(["Ann", "Bo", "Cy"].map((name) => [entry(name)?.dataset.pin, entry(name)?.getAttribute("aria-current")])).toEqual([
      ["here", "true"],
      ["there", null],
      ["here", "true"],
    ]);
  });

  it("counts those the map can't place while it shows the shortlist", () => {
    renderTab({ pins: [], unplaced: 1 }, card("Ann-AAAAAAAA", "Ann"), card("Bo-BBBBBBBB", "Bo"));
    screen.getByText("2 therapists, kept in this browser only · 1 not on the map.");
  });

  it("tells the map whose card the pointer is on, for it to ring their pin", () => {
    const onHighlight = vi.fn();
    renderTab({ onHighlight }, card("Ann-AAAAAAAA", "Ann"));
    const ann = screen.getByRole("link", { name: "Ann" }).closest<HTMLElement>("[data-slot=card]")!;
    fireEvent.pointerEnter(ann);
    expect(onHighlight).toHaveBeenLastCalledWith("Ann-AAAAAAAA");
    fireEvent.pointerLeave(ann);
    expect(onHighlight).toHaveBeenLastCalledWith(undefined);
  });
});
