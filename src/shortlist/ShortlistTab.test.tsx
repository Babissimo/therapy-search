// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { ComponentProps } from "react";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, onTestFinished, vi } from "vitest";
import { TooltipProvider } from "@/components/ui/tooltip";
import { api } from "@/lib/api";
import type { Pin } from "@/search/map/pins";
import { createSetAsideView, SetAsideContext } from "./setAside";
import { ShortlistTab } from "./ShortlistTab";
import { createShortlistStore, SHORTLIST_KEY, type ShortlistCard, type ShortlistStore, type Status } from "./store";
import { ShortlistContext } from "./useShortlist";

const card = (slug: string, name: string): ShortlistCard => ({
  slug,
  name,
  initials: "XX",
  location: "Leeds LS1",
  summary: `About ${name}.`,
  tags: ["Anxiety", "Grief"],
});

type Props = Omit<ComponentProps<typeof ShortlistTab>, "sought"> & { sought?: string[]; statuses?: Record<string, Status>; store?: ShortlistStore };

/** The tab over a shortlist of `cards`, each newer than the last, with `statuses` by slug before it draws. */
function renderTab({ sought = [], statuses = {}, store: given, ...props }: Props, ...cards: ShortlistCard[]) {
  let t = 1000;
  const store = given ?? createShortlistStore(null, () => t++);
  for (const c of cards) store.add(c);
  for (const [slug, status] of Object.entries(statuses)) store.setStatus(slug, status);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <ShortlistContext.Provider value={store}>
        <SetAsideContext.Provider value={createSetAsideView()}>
          <TooltipProvider>
            <MemoryRouter>
              <ShortlistTab sought={new Set(sought)} {...props} />
            </MemoryRouter>
          </TooltipProvider>
        </SetAsideContext.Provider>
      </ShortlistContext.Provider>
    </QueryClientProvider>,
  );
  return store;
}

const pin = (key: string, ...cards: ShortlistCard[]): Pin => ({ key, point: { lat: 51, lng: 0 }, therapists: cards, kind: "outcode" });
const entry = (name: string) => screen.getByRole("heading", { name }).closest("li");

/** The cards shown, by the names their headings link. */
const names = () =>
  screen
    .getAllByRole("heading")
    .filter((heading) => heading.querySelector("a"))
    .map((heading) => heading.textContent);

/** The step a therapist's track stands at, by its name. */
const stepOf = (name: string) =>
  within(screen.getByRole("list", { name: `Steps with ${name}` }))
    .getAllByRole("listitem")
    .find((step) => step.getAttribute("aria-current") === "step")?.textContent;

const openSetAside = () => fireEvent.click(screen.getByRole("button", { name: /^Set aside, /, expanded: false }));

// Each card's office is asked about; these profiles name no fee unless a test says otherwise.
beforeEach(() => {
  vi.spyOn(api, "office").mockResolvedValue({});
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

/**
 * jsdom lays nothing out, so each entry is given a place of its own down the tab for dnd-kit to measure. Timers are
 * faked so a move runs synchronously, as an async test that timed out would leave its `act` open over the next one.
 */
function layOutEntries() {
  vi.useFakeTimers();
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
    const li = this.closest("li");
    if (!li) return new DOMRect();
    return new DOMRect(0, [...document.querySelectorAll("li")].indexOf(li) * 200, 300, 180);
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

/** What dnd-kit's live regions say, the list and "Set aside" each having one, run together: enough while only one of them has spoken. */
const announced = () =>
  screen
    .getAllByRole("status")
    .map((region) => region.textContent)
    .join("");

/** Opens a therapist's status menu as a keyboard does, since jsdom's pointer events lack the button Radix checks for. */
function openMenu(name: string) {
  fireEvent.keyDown(screen.getByRole("button", { name: new RegExp(`^Status of ${name}:`) }), { key: "Enter" });
}

const choose = (label: string) => fireEvent.click(screen.getByRole("menuitemradio", { name: label }));

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

  it("gives each card the fee its profile names for its office, as the results do", async () => {
    const office = vi.spyOn(api, "office").mockResolvedValue({ cost: "£65" });
    renderTab({}, card("Ann-AAAAAAAA", "Ann"));
    await screen.findByText("£65");
    expect(office).toHaveBeenCalledWith("Ann-AAAAAAAA", "LEEDS LS1", expect.any(AbortSignal));
  });

  it("asks about the offices of those set aside only once their section is open", async () => {
    renderTab({ statuses: { "Ann-AAAAAAAA": "setAside" } }, card("Ann-AAAAAAAA", "Ann"), card("Bo-BBBBBBBB", "Bo"));
    await waitFor(() => expect(api.office).toHaveBeenCalled());
    expect(vi.mocked(api.office).mock.calls.map(([slug]) => slug)).toEqual(["Bo-BBBBBBBB"]);
    openSetAside();
    await waitFor(() => expect(api.office).toHaveBeenCalledWith("Ann-AAAAAAAA", "LEEDS LS1", expect.any(AbortSignal)));
  });

  it("shows on each card where the visitor stands, gathering those set aside under a closed heading at the foot", () => {
    renderTab(
      { statuses: { "Ann-AAAAAAAA": "seeing", "Cy-CCCCCCCC": "setAside" } },
      card("Ann-AAAAAAAA", "Ann"),
      card("Bo-BBBBBBBB", "Bo"),
      card("Cy-CCCCCCCC", "Cy"),
      card("Di-DDDDDDDD", "Di"),
    );
    expect(names()).toEqual(["Di", "Bo", "Ann"]);
    expect(stepOf("Ann")).toBe("Seeing them");
    expect(stepOf("Bo")).toBe("To contact");
    openSetAside();
    expect(names()).toEqual(["Di", "Bo", "Ann", "Cy"]);
    within(entry("Cy")!).getByText("Set aside", { selector: "p" });
    screen.getByRole("button", { name: "Set aside, 1 therapist", expanded: true });
  });

  it("keeps a card in place as its track moves the therapist on, saying so", () => {
    const store = renderTab({}, card("Ann-AAAAAAAA", "Ann"), card("Bo-BBBBBBBB", "Bo"), card("Cy-CCCCCCCC", "Cy"));
    const next = screen.getByRole("button", { name: "Mark contacted, Bo" });
    act(() => next.focus());
    fireEvent.click(next);
    expect(names()).toEqual(["Cy", "Bo", "Ann"]);
    expect(stepOf("Bo")).toBe("Contacted");
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Consultation booked, Bo" }));
    screen.getByText("Bo: Contacted.");
    expect(store.get().map((e) => e.card.name)).toEqual(["Cy", "Bo", "Ann"]);
  });

  it("gives focus to the closed section's heading when a therapist is set aside", () => {
    renderTab({}, card("Ann-AAAAAAAA", "Ann"), card("Bo-BBBBBBBB", "Bo"));
    openMenu("Ann");
    choose("Set aside");
    expect(names()).toEqual(["Bo"]);
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Set aside, 1 therapist" }));
    screen.getByText("Ann: Set aside.");
  });

  it("brings a therapist back from Set aside to their old place, focus following", () => {
    const store = renderTab(
      { statuses: { "Bo-BBBBBBBB": "setAside" } },
      card("Ann-AAAAAAAA", "Ann"),
      card("Bo-BBBBBBBB", "Bo"),
      card("Cy-CCCCCCCC", "Cy"),
    );
    expect(names()).toEqual(["Cy", "Ann"]);
    openSetAside();
    fireEvent.click(screen.getByRole("button", { name: "Consider again, Bo" }));
    expect(names()).toEqual(["Cy", "Bo", "Ann"]);
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Status of Bo: to contact" }));
    screen.getByText("Bo: To contact.");
    expect(screen.queryByRole("button", { name: /^Set aside, / })).toBeNull();
    expect(store.get().map((e) => e.card.name)).toEqual(["Cy", "Bo", "Ann"]);
  });

  it("keeps a removed therapist in place, dimmed, with where they stood but nothing to change it, until they are added back", () => {
    const store = renderTab({}, card("Ann-AAAAAAAA", "Ann"), card("Bo-BBBBBBBB", "Bo"), card("Cy-CCCCCCCC", "Cy"));
    fireEvent.click(screen.getByRole("button", { name: "Remove Bo from your shortlist" }));
    expect(store.has("Bo-BBBBBBBB")).toBe(false);
    expect(names()).toEqual(["Cy", "Bo", "Ann"]);
    expect(entry("Bo")?.className).toMatch(/opacity-60/);
    expect(stepOf("Bo")).toBe("To contact");
    expect(screen.queryByRole("button", { name: "Mark contacted, Bo" })).toBeNull();
    expect(screen.queryByRole("button", { name: /^Status of Bo:/ })).toBeNull();
    screen.getByText("Kept in this browser only.");
    fireEvent.click(screen.getByRole("button", { name: "Add Bo to your shortlist" }));
    expect(store.get().map((e) => e.card.name)).toEqual(["Cy", "Bo", "Ann"]);
    expect(entry("Bo")?.className).not.toMatch(/opacity-60/);
    screen.getByRole("button", { name: "Mark contacted, Bo" });
  });

  it("adds a therapist removed from Set aside back as they were, though the section was closed in between", () => {
    const store = renderTab(
      { statuses: { "Bo-BBBBBBBB": "setAside" } },
      card("Ann-AAAAAAAA", "Ann"),
      card("Bo-BBBBBBBB", "Bo"),
      card("Cy-CCCCCCCC", "Cy"),
    );
    openSetAside();
    fireEvent.click(screen.getByRole("button", { name: "Remove Bo from your shortlist" }));
    expect(entry("Bo")?.className).toMatch(/opacity-60/);
    screen.getByRole("button", { name: "Set aside, 0 therapists", expanded: true });
    fireEvent.click(screen.getByRole("button", { name: /^Set aside, / }));
    expect(names()).toEqual(["Cy", "Ann"]);
    openSetAside();
    fireEvent.click(screen.getByRole("button", { name: "Add Bo to your shortlist" }));
    expect(names()).toEqual(["Cy", "Ann", "Bo"]);
    expect(entry("Bo")?.className).not.toMatch(/opacity-60/);
    within(entry("Bo")!).getByText("Set aside", { selector: "p" });
    screen.getByRole("button", { name: "Set aside, 1 therapist", expanded: true });
    expect(store.get().map((e) => e.card.name)).toEqual(["Cy", "Bo", "Ann"]);
  });

  it("still says where the shortlist is kept once everyone on it is removed", () => {
    renderTab({}, card("Ann-AAAAAAAA", "Ann"));
    fireEvent.click(screen.getByRole("button", { name: "Remove Ann from your shortlist" }));
    expect(names()).toEqual(["Ann"]);
    screen.getByText("Kept in this browser only.");
  });

  it("still offers to clear the shortlist once everyone on it is removed, as their cards still show where the visitor stood", () => {
    const store = renderTab({ statuses: { "Ann-AAAAAAAA": "seeing" } }, card("Ann-AAAAAAAA", "Ann"));
    fireEvent.click(screen.getByRole("button", { name: "Remove Ann from your shortlist" }));
    expect(names()).toEqual(["Ann"]);
    fireEvent.click(screen.getByRole("button", { name: "Clear shortlist" }));
    screen.getByText("This forgets the 1 therapist you removed, and where you stood with them, so they can't be put back as they were.");
    fireEvent.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Clear shortlist" }));
    expect(screen.queryAllByRole("heading")).toEqual([]);
    expect(screen.queryByRole("button", { name: "Clear shortlist" })).toBeNull();
    expect(store.clears()).toBe(1);
  });

  it("clears everyone once the visitor confirms, naming how many will go, and gives focus to the empty tab's note", async () => {
    const store = renderTab({}, card("Ann-AAAAAAAA", "Ann"), card("Bo-BBBBBBBB", "Bo"), card("Cy-CCCCCCCC", "Cy"));
    act(() => store.setStatus("Ann-AAAAAAAA", "seeing"));
    // Bo, removed already, is kept in place to be added back until the list is cleared.
    fireEvent.click(screen.getByRole("button", { name: "Remove Bo from your shortlist" }));
    fireEvent.click(screen.getByRole("button", { name: "Clear shortlist" }));
    const dialog = screen.getByRole("alertdialog", { name: "Clear your shortlist?" });
    const description = screen.getByText("This removes 2 therapists, and where you stand with them, from this browser. It can't be undone.");
    expect(dialog.getAttribute("aria-describedby")).toBe(description.id);
    // The safer choice has focus as the dialog opens.
    expect(document.activeElement).toBe(within(dialog).getByRole("button", { name: "Cancel" }));
    fireEvent.click(within(dialog).getByRole("button", { name: "Clear shortlist" }));
    expect(store.get()).toEqual([]);
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(screen.queryAllByRole("heading")).toEqual([]);
    const note = screen.getByText(/^Bookmark anyone who might suit you/).parentElement;
    expect(document.activeElement).toBe(note);
    // The dialog hands focus back once it has gone, which must not take it from the note.
    await act(() => new Promise((resolve) => setTimeout(resolve)));
    expect(document.activeElement).toBe(note);
  });

  it("lets everyone go when another tab clears the list, giving focus to the note if what had it went with them", () => {
    onTestFinished(() => localStorage.clear());
    const inBrowser = createShortlistStore(localStorage, Date.now, window);
    renderTab({ store: inBrowser }, card("Ann-AAAAAAAA", "Ann"), card("Bo-BBBBBBBB", "Bo"));
    fireEvent.click(screen.getByRole("button", { name: "Remove Bo from your shortlist" }));
    act(() => screen.getByRole("button", { name: /^Status of Ann:/ }).focus());
    // Another tab's clear, as this one hears it.
    localStorage.removeItem(SHORTLIST_KEY);
    act(() => void window.dispatchEvent(new StorageEvent("storage", { key: SHORTLIST_KEY, newValue: null })));
    expect(screen.queryAllByRole("heading")).toEqual([]);
    expect(document.activeElement).toBe(screen.getByText(/^Bookmark anyone who might suit you/).parentElement);
  });

  it("leaves focus alone when the list is cleared from under nothing that had it", () => {
    const store = renderTab({}, card("Ann-AAAAAAAA", "Ann"));
    const elsewhere = document.body.appendChild(document.createElement("button"));
    onTestFinished(() => elsewhere.remove());
    elsewhere.focus();
    act(() => store.clear());
    expect(document.activeElement).toBe(elsewhere);
  });

  it("leaves the shortlist as it was when the visitor cancels, with focus back on the button", async () => {
    const store = renderTab({}, card("Ann-AAAAAAAA", "Ann"));
    const before = store.get();
    const button = screen.getByRole("button", { name: "Clear shortlist" });
    fireEvent.click(button);
    fireEvent.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(store.get()).toBe(before);
    expect(names()).toEqual(["Ann"]);
    await waitFor(() => expect(document.activeElement).toBe(button));
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

  it("keeps a drag among those set aside, or among those not", () => {
    layOutEntries();
    const store = renderTab(
      { statuses: { "Ann-AAAAAAAA": "setAside", "Bo-BBBBBBBB": "setAside" } },
      card("Ann-AAAAAAAA", "Ann"),
      card("Bo-BBBBBBBB", "Bo"),
      card("Cy-CCCCCCCC", "Cy"),
      card("Di-DDDDDDDD", "Di"),
    );
    openSetAside();
    expect(names()).toEqual(["Di", "Cy", "Bo", "Ann"]);
    moveByKeys("Cy", "ArrowDown", "Space");
    expect(names()).toEqual(["Di", "Cy", "Bo", "Ann"]);
    expect(announced()).toBe("Cy put down at number 2 of 2.");
    moveByKeys("Bo", "ArrowDown", "Space");
    expect(names()).toEqual(["Di", "Cy", "Ann", "Bo"]);
    expect(store.get().map((e) => e.card.name)).toEqual(["Di", "Cy", "Ann", "Bo"]);
  });

  it("puts a therapist moved to the top of the list after whoever precedes them among everyone", () => {
    layOutEntries();
    const store = renderTab(
      { statuses: { "Di-DDDDDDDD": "setAside" } },
      card("Ann-AAAAAAAA", "Ann"),
      card("Bo-BBBBBBBB", "Bo"),
      card("Cy-CCCCCCCC", "Cy"),
      card("Di-DDDDDDDD", "Di"),
    );
    expect(names()).toEqual(["Cy", "Bo", "Ann"]);
    moveByKeys("Bo", "ArrowUp", "Space");
    expect(names()).toEqual(["Bo", "Cy", "Ann"]);
    expect(store.get().map((e) => e.card.name)).toEqual(["Di", "Bo", "Cy", "Ann"]);
  });

  it("shows therapists shortlisted in another tab while it is open", () => {
    const store = renderTab({}, card("Ann-AAAAAAAA", "Ann"));
    act(() => store.add(card("Bo-BBBBBBBB", "Bo")));
    expect(names()).toEqual(["Bo", "Ann"]);
    screen.getByRole("link", { name: "Bo" });
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

  it("clears the map's highlight when a therapist is set aside while the section is closed", () => {
    const onHighlight = vi.fn();
    renderTab({ onHighlight }, card("Ann-AAAAAAAA", "Ann"), card("Bo-BBBBBBBB", "Bo"));
    act(() => screen.getByRole("button", { name: /^Status of Ann:/ }).focus());
    expect(onHighlight).toHaveBeenLastCalledWith("Ann-AAAAAAAA");
    openMenu("Ann");
    choose("Set aside");
    expect(onHighlight).toHaveBeenLastCalledWith(undefined);
  });

  it("clears the map's highlight when a therapist's card goes from under the pointer or focus, as another tab can send it", () => {
    const onHighlight = vi.fn();
    const store = renderTab({ onHighlight }, card("Ann-AAAAAAAA", "Ann"), card("Bo-BBBBBBBB", "Bo"));
    act(() => screen.getByRole("button", { name: /^Status of Ann:/ }).focus());
    expect(onHighlight).toHaveBeenLastCalledWith("Ann-AAAAAAAA");
    act(() => store.setStatus("Ann-AAAAAAAA", "setAside"));
    expect(names()).toEqual(["Bo"]);
    expect(onHighlight).toHaveBeenLastCalledWith(undefined);
  });

  it("follows a therapist set aside into the open section, focus and the map's highlight with them", () => {
    const onHighlight = vi.fn();
    renderTab({ onHighlight, statuses: { "Bo-BBBBBBBB": "setAside" } }, card("Ann-AAAAAAAA", "Ann"), card("Bo-BBBBBBBB", "Bo"));
    openSetAside();
    act(() => screen.getByRole("button", { name: /^Status of Ann:/ }).focus());
    openMenu("Ann");
    choose("Set aside");
    expect(names()).toEqual(["Bo", "Ann"]);
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Status of Ann: set aside" }));
    expect(onHighlight).toHaveBeenLastCalledWith("Ann-AAAAAAAA");
  });

  it("gives focus to the bookmark that can put back a therapist the menu removed", () => {
    const store = renderTab({}, card("Ann-AAAAAAAA", "Ann"));
    openMenu("Ann");
    fireEvent.click(screen.getByRole("menuitem", { name: "Remove from shortlist" }));
    expect(store.has("Ann-AAAAAAAA")).toBe(false);
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Add Ann to your shortlist" }));
  });
});
