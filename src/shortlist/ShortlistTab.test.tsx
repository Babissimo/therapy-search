// @vitest-environment jsdom
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import type { ComponentProps } from "react";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
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

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

/**
 * jsdom lays nothing out, so each entry is given a place of its own down the list for dnd-kit to measure. Timers are
 * faked so a move runs synchronously, as an async test that timed out would leave its `act` open over the next one.
 */
function layOutEntries() {
  vi.useFakeTimers();
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
    const li = this.closest("li");
    if (!li?.parentElement) return new DOMRect();
    return new DOMRect(0, [...li.parentElement.children].indexOf(li) * 200, 300, 180);
  });
}

/** Picks a therapist up by their handle, as a keyboard does, then presses each key in turn. */
function moveByKeys(name: string, ...codes: string[]) {
  const handle = screen.getByRole("button", { name: `Move ${name}` });
  handle.focus();
  fireEvent.keyDown(handle, { code: "Space" });
  // dnd-kit listens for the next key only once the one that picked them up has passed.
  act(() => vi.runOnlyPendingTimers());
  for (const code of codes) fireEvent.keyDown(handle, { code });
}

const announced = () => screen.getByRole("status").textContent;

describe("ShortlistTab", () => {
  it("says how to shortlist someone when the list is empty", () => {
    renderTab({});
    screen.getByText(/^Bookmark anyone who might suit you/);
  });

  it("lists shortlisted therapists newest first, each linking to their profile", () => {
    renderTab({}, card("Ann-AAAAAAAA", "Ann"), card("Bo-BBBBBBBB", "Bo"));
    expect(names()).toEqual(["Bo", "Ann"]);
    expect(screen.getByRole("link", { name: "Ann" }).getAttribute("href")).toBe("/therapist/Ann-AAAAAAAA");
    screen.getByText("Kept in this browser only.");
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
    screen.getByText("Kept in this browser only.");
    fireEvent.click(screen.getByRole("button", { name: "Add Bo to your shortlist" }));
    expect(store.get().map((e) => e.card.name)).toEqual(["Cy", "Bo", "Ann"]);
    expect(entry("Bo")?.className).not.toMatch(/opacity-60/);
  });

  it("still says where the shortlist is kept once everyone on it is removed", () => {
    renderTab({}, card("Ann-AAAAAAAA", "Ann"));
    fireEvent.click(screen.getByRole("button", { name: "Remove Ann from your shortlist" }));
    expect(names()).toEqual(["Ann"]);
    screen.getByText("Kept in this browser only.");
  });

  it("moves a therapist by their handle, saying where they are as they go", () => {
    layOutEntries();
    const store = renderTab({}, card("Ann-AAAAAAAA", "Ann"), card("Bo-BBBBBBBB", "Bo"), card("Cy-CCCCCCCC", "Cy"));
    moveByKeys("Cy");
    expect(announced()).toBe("Picked up Cy, number 1 of 3.");
    fireEvent.keyDown(screen.getByRole("button", { name: "Move Cy" }), { code: "ArrowDown" });
    expect(announced()).toBe("Cy moved to number 2 of 3.");
    fireEvent.keyDown(screen.getByRole("button", { name: "Move Cy" }), { code: "Escape" });
    expect(names()).toEqual(["Cy", "Bo", "Ann"]);
    expect(announced()).toBe("Cy put back at number 1 of 3.");
    moveByKeys("Cy", "ArrowDown", "ArrowDown", "Space");
    expect(names()).toEqual(["Bo", "Ann", "Cy"]);
    expect(store.get().map((e) => e.card.name)).toEqual(["Bo", "Ann", "Cy"]);
    expect(announced()).toBe("Cy put down at number 3 of 3.");
  });

  it("keeps a removed therapist's place as others move past, but can't move them", () => {
    layOutEntries();
    const store = renderTab({}, card("Ann-AAAAAAAA", "Ann"), card("Bo-BBBBBBBB", "Bo"), card("Cy-CCCCCCCC", "Cy"));
    fireEvent.click(screen.getByRole("button", { name: "Remove Bo from your shortlist" }));
    expect(screen.getByRole<HTMLButtonElement>("button", { name: "Move Bo" }).disabled).toBe(true);
    moveByKeys("Cy", "ArrowDown", "Space");
    expect(names()).toEqual(["Bo", "Cy", "Ann"]);
    fireEvent.click(screen.getByRole("button", { name: "Add Bo to your shortlist" }));
    expect(store.get().map((e) => e.card.name)).toEqual(["Bo", "Cy", "Ann"]);
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
    screen.getByText("Kept in this browser only · 1 not on the map.");
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
