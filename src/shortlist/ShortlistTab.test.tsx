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

/** Whether a therapist's portrait is faded, by the box that holds it. */
const faded = (name: string) =>
  /\bopacity-60\b/.test(within(entry(name)!).getByText("XX").closest("[data-slot=avatar]")?.parentElement?.className ?? "");

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

const button = (name: string) => screen.getByRole<HTMLButtonElement>("button", { name });

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

/** A visitor not asking for less motion, until the returned function changes their setting mid-visit. */
function motionSetting() {
  const listeners = new Set<() => void>();
  let reduce = false;
  vi.stubGlobal("matchMedia", (query: string) => ({
    get matches() {
      return query === "(prefers-reduced-motion: reduce)" && reduce;
    },
    media: query,
    addEventListener: (_: string, listener: () => void) => listeners.add(listener),
    removeEventListener: (_: string, listener: () => void) => listeners.delete(listener),
  }));
  onTestFinished(() => void vi.unstubAllGlobals());
  return (next: boolean) => {
    reduce = next;
    act(() => listeners.forEach((listener) => listener()));
  };
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

/** jsdom has no clipboard; this one takes text as `writeText` does with it. */
function stubClipboard<T extends (text: string) => Promise<void>>(writeText: T): T {
  Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
  onTestFinished(() => void delete (navigator as { clipboard?: unknown }).clipboard);
  return writeText;
}

describe("ShortlistTab", () => {
  it("says how to shortlist someone when the list is empty, with nothing to clear", () => {
    renderTab({});
    screen.getByText(/^Bookmark anyone who might suit you/);
    expect(screen.queryByRole("button", { name: "Clear shortlist" })).toBeNull();
  });

  it("offers on the empty tab to forget those removed, saying how many are kept and for how long, then gives focus to the note", async () => {
    let t = 1000;
    const store = createShortlistStore(null, () => t++);
    store.add(card("Ann-AAAAAAAA", "Ann"));
    store.add(card("Bo-BBBBBBBB", "Bo"));
    store.setNote("Ann-AAAAAAAA", "Rang on Tuesday");
    store.remove("Ann-AAAAAAAA");
    store.remove("Bo-BBBBBBBB");
    renderTab({ store });
    screen.getByText(/^Bookmark anyone who might suit you/);
    screen.getByText("2 therapists you removed are kept for 30 days, in case you add them back.");
    fireEvent.click(screen.getByRole("button", { name: "Clear shortlist" }));
    screen.getByText("This forgets the 2 therapists you removed, with your notes and where you stood with them, so they can't be put back as they were.");
    fireEvent.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Clear shortlist" }));
    expect(store.removedCount()).toBe(0);
    expect(screen.queryByText(/you removed/)).toBeNull();
    expect(screen.queryByRole("button", { name: "Clear shortlist" })).toBeNull();
    const note = screen.getByText(/^Bookmark anyone who might suit you/).parentElement;
    expect(document.activeElement).toBe(note);
    // The dialog hands focus back once it has gone, which must not take it from the note.
    await act(() => new Promise((resolve) => setTimeout(resolve)));
    expect(document.activeElement).toBe(note);
  });

  it("says so on the empty tab when one therapist removed is kept", () => {
    const store = createShortlistStore(null);
    store.add(card("Ann-AAAAAAAA", "Ann"));
    store.remove("Ann-AAAAAAAA");
    renderTab({ store });
    screen.getByText("1 therapist you removed is kept for 30 days, in case you add them back.");
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

  it("keeps a removed therapist in place, their portrait faded, with where they stood but nothing to change it, until they are added back", () => {
    const store = renderTab({}, card("Ann-AAAAAAAA", "Ann"), card("Bo-BBBBBBBB", "Bo"), card("Cy-CCCCCCCC", "Cy"));
    fireEvent.click(screen.getByRole("button", { name: "Remove Bo from your shortlist" }));
    expect(store.has("Bo-BBBBBBBB")).toBe(false);
    expect(names()).toEqual(["Cy", "Bo", "Ann"]);
    expect(faded("Bo")).toBe(true);
    // Their name and where they stood keep their full strength.
    expect(screen.getByRole("link", { name: "Bo" }).closest("[class*=opacity]")).toBeNull();
    expect(within(entry("Bo")!).getByText("To contact", { selector: "p" }).closest("[class*=opacity]")).toBeNull();
    within(entry("Bo")!).getByText("Removed from your shortlist");
    expect(stepOf("Bo")).toBe("To contact");
    expect(screen.queryByRole("button", { name: "Mark contacted, Bo" })).toBeNull();
    expect(screen.queryByRole("button", { name: /^Status of Bo:/ })).toBeNull();
    screen.getByText("Kept in this browser only.");
    fireEvent.click(screen.getByRole("button", { name: "Add Bo to your shortlist" }));
    expect(store.get().map((e) => e.card.name)).toEqual(["Cy", "Bo", "Ann"]);
    expect(faded("Bo")).toBe(false);
    expect(screen.queryByText("Removed from your shortlist")).toBeNull();
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
    expect(faded("Bo")).toBe(true);
    screen.getByRole("button", { name: "Set aside, 0 therapists", expanded: true });
    fireEvent.click(screen.getByRole("button", { name: /^Set aside, / }));
    expect(names()).toEqual(["Cy", "Ann"]);
    openSetAside();
    fireEvent.click(screen.getByRole("button", { name: "Add Bo to your shortlist" }));
    expect(names()).toEqual(["Cy", "Ann", "Bo"]);
    expect(faded("Bo")).toBe(false);
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
    screen.getByText("This forgets the 1 therapist you removed, with your notes and where you stood with them, so they can't be put back as they were.");
    fireEvent.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Clear shortlist" }));
    expect(screen.queryAllByRole("heading")).toEqual([]);
    expect(screen.queryByRole("button", { name: "Clear shortlist" })).toBeNull();
    expect(store.clears()).toBe(1);
  });

  it("gives the first line of each therapist's note on their card, as it changes", () => {
    const store = renderTab({}, card("Ann-AAAAAAAA", "Ann"), card("Bo-BBBBBBBB", "Bo"));
    act(() => store.setNote("Ann-AAAAAAAA", "Rang on Tuesday\nCall back Friday"));
    expect(within(entry("Ann")!).getByText("Rang on Tuesday").closest("p")?.textContent).toBe("Your notes: Rang on Tuesday");
    expect(within(entry("Bo")!).queryByText(/Your notes/)).toBeNull();
    act(() => store.setNote("Ann-AAAAAAAA", "Booked for Monday"));
    within(entry("Ann")!).getByText("Booked for Monday");
    // Her card stays in place, with her note, once she is removed.
    fireEvent.click(screen.getByRole("button", { name: "Remove Ann from your shortlist" }));
    within(entry("Ann")!).getByText("Booked for Monday");
  });

  it("clears everyone once the visitor confirms, naming how many will go, removed ones too, and gives focus to the empty tab's note", async () => {
    const store = renderTab({}, card("Ann-AAAAAAAA", "Ann"), card("Bo-BBBBBBBB", "Bo"), card("Cy-CCCCCCCC", "Cy"));
    act(() => store.setStatus("Ann-AAAAAAAA", "seeing"));
    // Bo, removed already, is kept in place to be added back until the list is cleared.
    fireEvent.click(screen.getByRole("button", { name: "Remove Bo from your shortlist" }));
    fireEvent.click(screen.getByRole("button", { name: "Clear shortlist" }));
    const dialog = screen.getByRole("alertdialog", { name: "Clear your shortlist?" });
    const description = screen.getByText(
      "This removes 2 therapists from this browser, with your notes and where you stand with them, and forgets the 1 therapist you removed. It can't be undone.",
    );
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

  it("counts among those it forgets everyone removed, not only those the tab shows", () => {
    const store = createShortlistStore(null);
    store.add(card("Cy-CCCCCCCC", "Cy"));
    store.remove("Cy-CCCCCCCC");
    renderTab({ store }, card("Ann-AAAAAAAA", "Ann"));
    expect(names()).toEqual(["Ann"]);
    fireEvent.click(screen.getByRole("button", { name: "Clear shortlist" }));
    screen.getByText(
      "This removes 1 therapist from this browser, with your notes and where you stand with them, and forgets the 1 therapist you removed. It can't be undone.",
    );
  });

  it("offers no clear once nobody is listed or kept, though the tab still shows a card removed here", () => {
    onTestFinished(() => localStorage.clear());
    const inBrowser = createShortlistStore(localStorage, Date.now, window);
    renderTab({ store: inBrowser }, card("Ann-AAAAAAAA", "Ann"));
    fireEvent.click(screen.getByRole("button", { name: "Remove Ann from your shortlist" }));
    // A previous release's tab writes the list without anyone removed.
    const written = JSON.stringify({ v: 1, entries: {} });
    localStorage.setItem(SHORTLIST_KEY, written);
    act(() => void window.dispatchEvent(new StorageEvent("storage", { key: SHORTLIST_KEY, newValue: written })));
    expect(names()).toEqual(["Ann"]);
    expect(screen.queryByRole("button", { name: "Clear shortlist" })).toBeNull();
  });

  it("leaves the shortlist as it was when the visitor cancels, with focus back on the button", async () => {
    const store = renderTab({}, card("Ann-AAAAAAAA", "Ann"));
    const before = store.get();
    const button = screen.getByRole("button", { name: "Clear shortlist" });
    fireEvent.click(button);
    screen.getByText("This removes 1 therapist from this browser, with your notes and where you stand with them. It can't be undone.");
    fireEvent.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(store.get()).toBe(before);
    expect(names()).toEqual(["Ann"]);
    await waitFor(() => expect(document.activeElement).toBe(button));
  });

  it("copies the shortlist as text, less anyone removed, saying so on the button for a moment and to a screen reader", async () => {
    const writeText = stubClipboard(vi.fn().mockResolvedValue(undefined));
    renderTab({ statuses: { "Ann-AAAAAAAA": "contacted" } }, card("Ann-AAAAAAAA", "Ann"), card("Bo-BBBBBBBB", "Bo"), card("Cy-CCCCCCCC", "Cy"));
    fireEvent.click(screen.getByRole("button", { name: "Remove Bo from your shortlist" }));
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
    vi.setSystemTime(new Date(2026, 9, 2));
    fireEvent.click(screen.getByRole("button", { name: "Copy as text" }));
    // The copy settles with no timer, which waiting would need.
    await act(async () => {});
    screen.getByText("Copied 2 therapists as text, ready to paste.");
    expect(writeText).toHaveBeenCalledWith(
      [
        "My shortlist of UKCP therapists, 2 October 2026",
        "1. Cy: To contact\nLeeds LS1\nhttps://www.psychotherapy.org.uk/therapist/Cy-CCCCCCCC",
        "2. Ann: Contacted\nLeeds LS1\nhttps://www.psychotherapy.org.uk/therapist/Ann-AAAAAAAA\n",
      ].join("\n\n"),
    );
    const button = screen.getByRole("button", { name: "Copied" });
    act(() => vi.advanceTimersByTime(3000));
    expect(screen.getByRole("button", { name: "Copy as text" })).toBe(button);
  });

  it("is heard again when the shortlist is copied again", async () => {
    stubClipboard(vi.fn().mockResolvedValue(undefined));
    renderTab({}, card("Ann-AAAAAAAA", "Ann"));
    fireEvent.click(screen.getByRole("button", { name: "Copy as text" }));
    const said = await screen.findByText("Copied 1 therapist as text, ready to paste.");
    fireEvent.click(screen.getByRole("button", { name: "Copied" }));
    // Emptied first, so the same words are a change the live region announces.
    expect(said.textContent).toBe("");
    await waitFor(() => expect(said.textContent).toBe("Copied 1 therapist as text, ready to paste."));
  });

  it("says Copied for the full moment after a second copy, however soon after the first", async () => {
    stubClipboard(vi.fn().mockResolvedValue(undefined));
    renderTab({}, card("Ann-AAAAAAAA", "Ann"));
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    fireEvent.click(screen.getByRole("button", { name: "Copy as text" }));
    await act(async () => {});
    act(() => vi.advanceTimersByTime(2000));
    fireEvent.click(screen.getByRole("button", { name: "Copied" }));
    await act(async () => {});
    act(() => vi.advanceTimersByTime(2000));
    screen.getByRole("button", { name: "Copied" });
    act(() => vi.advanceTimersByTime(1000));
    screen.getByRole("button", { name: "Copy as text" });
  });

  it("says when the shortlist couldn't be copied, suggesting printing it", async () => {
    // Refused, with no other way to copy, as jsdom has no execCommand.
    stubClipboard(vi.fn().mockRejectedValue(new DOMException("Denied", "NotAllowedError")));
    renderTab({}, card("Ann-AAAAAAAA", "Ann"));
    fireEvent.click(screen.getByRole("button", { name: "Copy as text" }));
    await screen.findByText("Your shortlist couldn't be copied in this browser. You could print it instead.");
    screen.getByRole("button", { name: "Couldn't copy" });
  });

  it("offers no copy once everyone is removed, though their cards still show", () => {
    renderTab({}, card("Ann-AAAAAAAA", "Ann"));
    screen.getByRole("button", { name: "Copy as text" });
    fireEvent.click(screen.getByRole("button", { name: "Remove Ann from your shortlist" }));
    expect(screen.queryByRole("button", { name: "Copy as text" })).toBeNull();
    screen.getByRole("button", { name: "Clear shortlist" });
  });

  it("prints as the shortlist under a title of its own, without its controls, anyone removed or a closed Set aside", () => {
    renderTab(
      { statuses: { "Ann-AAAAAAAA": "setAside", "Cy-CCCCCCCC": "setAside" } },
      card("Ann-AAAAAAAA", "Ann"),
      card("Bo-BBBBBBBB", "Bo"),
      card("Cy-CCCCCCCC", "Cy"),
      card("Di-DDDDDDDD", "Di"),
    );
    const display = (element: Element | null | undefined) => [...(element?.classList ?? [])].filter((name) => /^(print:)?(hidden|block)$/.test(name));
    expect(display(screen.getByText("Your shortlist"))).toEqual(["hidden", "print:block"]);
    expect(display(screen.getByText("Kept in this browser only.").parentElement)).toEqual(["print:hidden"]);
    const setAside = screen.getByRole("button", { name: /^Set aside, / }).closest("section");
    expect(display(setAside)).toEqual(["print:hidden"]);
    openSetAside();
    expect(display(setAside)).toEqual([]);
    fireEvent.click(screen.getByRole("button", { name: "Remove Bo from your shortlist" }));
    expect(display(entry("Bo"))).toEqual(["print:hidden"]);
    expect(display(entry("Di"))).toEqual([]);
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

  it("moves the cards a drag passes at once, from the moment the visitor asks for less motion", () => {
    const askForLessMotion = motionSetting();
    layOutEntries();
    renderTab({}, card("Ann-AAAAAAAA", "Ann"), card("Bo-BBBBBBBB", "Bo"), card("Cy-CCCCCCCC", "Cy"));
    moveByKeys("Cy", "ArrowDown");
    expect(entry("Bo")!.style.transition).toMatch(/^transform \d+ms/);
    askForLessMotion(true);
    expect(entry("Bo")!.style.transition).toBe("");
  });

  it("scrolls the list along with a card carried past its edge, gliding only while the visitor doesn't ask for less motion", () => {
    const askForLessMotion = motionSetting();
    layOutEntries();
    renderTab({}, card("Ann-AAAAAAAA", "Ann"), card("Bo-BBBBBBBB", "Bo"), card("Cy-CCCCCCCC", "Cy"));
    // A scroller showing the first card and a half.
    const list = entry("Cy")!.parentElement!;
    list.style.overflowY = "auto";
    Object.defineProperties(list, { clientHeight: { value: 300 }, scrollHeight: { value: 600 } });
    list.getBoundingClientRect = () => new DOMRect(0, 0, 300, 300);
    // dnd-kit scrolls to a place or by an amount, as the move goes.
    const scroll = vi.fn();
    Object.assign(list, { scrollTo: scroll, scrollBy: scroll });
    moveByKeys("Cy", "ArrowDown");
    expect(scroll).toHaveBeenLastCalledWith(expect.objectContaining({ behavior: "smooth" }));
    fireEvent.keyDown(button("Move Cy"), { code: "Escape" });
    askForLessMotion(true);
    moveByKeys("Cy", "ArrowDown");
    expect(scroll).toHaveBeenCalledTimes(2);
    expect(scroll).toHaveBeenLastCalledWith(expect.objectContaining({ behavior: "instant" }));
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

  it("moves a therapist a place at a time by the buttons beside their handle, saying where they are now, focus staying on the button pressed", () => {
    const store = renderTab({}, card("Ann-AAAAAAAA", "Ann"), card("Bo-BBBBBBBB", "Bo"), card("Cy-CCCCCCCC", "Cy"), card("Di-DDDDDDDD", "Di"));
    fireEvent.click(button("Move Di down"));
    expect(names()).toEqual(["Cy", "Di", "Bo", "Ann"]);
    screen.getByText("Di moved to number 2 of 4.");
    expect(document.activeElement).toBe(button("Move Di down"));
    fireEvent.click(button("Move Ann up"));
    expect(names()).toEqual(["Cy", "Di", "Ann", "Bo"]);
    screen.getByText("Ann moved to number 3 of 4.");
    expect(document.activeElement).toBe(button("Move Ann up"));
    expect(store.get().map((e) => e.card.name)).toEqual(["Cy", "Di", "Ann", "Bo"]);
  });

  it("gives focus to the other button once a therapist reaches an end of the list, where the one pressed is disabled", () => {
    renderTab({}, card("Ann-AAAAAAAA", "Ann"), card("Bo-BBBBBBBB", "Bo"), card("Cy-CCCCCCCC", "Cy"));
    expect([button("Move Cy up").disabled, button("Move Ann down").disabled]).toEqual([true, true]);
    fireEvent.click(button("Move Bo up"));
    expect(names()).toEqual(["Bo", "Cy", "Ann"]);
    expect(button("Move Bo up").disabled).toBe(true);
    expect(document.activeElement).toBe(button("Move Bo down"));
    fireEvent.click(button("Move Cy down"));
    expect(names()).toEqual(["Bo", "Ann", "Cy"]);
    screen.getByText("Cy moved to number 3 of 3.");
    expect(button("Move Cy down").disabled).toBe(true);
    expect(document.activeElement).toBe(button("Move Cy up"));
  });

  it("stands the move buttons and handle apart, and off the card, on a touch screen, where each takes a 44px target", () => {
    renderTab({}, card("Ann-AAAAAAAA", "Ann"), card("Bo-BBBBBBBB", "Bo"));
    const column = button("Move Ann up").parentElement!;
    expect([...column.children]).toEqual([button("Move Ann up"), button("Move Ann"), button("Move Ann down")]);
    // 28px buttons, 16px apart: targets centred on them meet without overlapping.
    expect(column.className).toContain("pointer-coarse:gap-4");
    expect(column.className).toContain("pointer-coarse:mr-1");
  });

  it("offers no move to a therapist alone on the list", () => {
    renderTab({}, card("Ann-AAAAAAAA", "Ann"));
    expect([button("Move Ann up").disabled, button("Move Ann down").disabled]).toEqual([true, true]);
  });

  it("moves others past a removed therapist by their buttons, keeping the removed one's place, but can't move them", () => {
    const store = renderTab({}, card("Ann-AAAAAAAA", "Ann"), card("Bo-BBBBBBBB", "Bo"), card("Cy-CCCCCCCC", "Cy"));
    fireEvent.click(screen.getByRole("button", { name: "Remove Bo from your shortlist" }));
    expect([button("Move Bo up").disabled, button("Move Bo down").disabled]).toEqual([true, true]);
    fireEvent.click(button("Move Cy down"));
    expect(names()).toEqual(["Bo", "Cy", "Ann"]);
    screen.getByText("Cy moved to number 2 of 3.");
    fireEvent.click(screen.getByRole("button", { name: "Add Bo to your shortlist" }));
    expect(store.get().map((e) => e.card.name)).toEqual(["Bo", "Cy", "Ann"]);
  });

  it("keeps a move by buttons among those set aside, or among those not, numbering each among their own", () => {
    const store = renderTab(
      { statuses: { "Ann-AAAAAAAA": "setAside", "Di-DDDDDDDD": "setAside" } },
      card("Ann-AAAAAAAA", "Ann"),
      card("Bo-BBBBBBBB", "Bo"),
      card("Cy-CCCCCCCC", "Cy"),
      card("Di-DDDDDDDD", "Di"),
    );
    fireEvent.click(button("Move Bo up"));
    expect(names()).toEqual(["Bo", "Cy"]);
    screen.getByText("Bo moved to number 1 of 2.");
    // At the top of the list, after whoever precedes them among everyone.
    expect(store.get().map((e) => e.card.name)).toEqual(["Di", "Bo", "Cy", "Ann"]);
    openSetAside();
    fireEvent.click(button("Move Di down"));
    expect(names()).toEqual(["Bo", "Cy", "Ann", "Di"]);
    screen.getByText("Di moved to number 2 of 2.");
    expect(document.activeElement).toBe(button("Move Di up"));
    expect(store.get().map((e) => e.card.name)).toEqual(["Bo", "Cy", "Ann", "Di"]);
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
    // Forced colours drop the ring, and keep an outline.
    expect(["Ann", "Bo", "Cy"].map((name) => entry(name)!.querySelector(".ring-highlight")?.classList.contains("forced-marked"))).toEqual([
      true,
      undefined,
      true,
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

  it("says who the menu removed, again after the bookmark has put them back, and gives focus to that bookmark", () => {
    const store = renderTab({}, card("Ann-AAAAAAAA", "Ann"));
    const said = () => [...document.querySelectorAll("[aria-live=polite]")].map((region) => region.textContent).filter(Boolean);
    openMenu("Ann");
    fireEvent.click(screen.getByRole("menuitem", { name: "Remove from shortlist" }));
    expect(store.has("Ann-AAAAAAAA")).toBe(false);
    const bookmark = screen.getByRole("button", { name: "Add Ann to your shortlist" });
    expect(document.activeElement).toBe(bookmark);
    expect(said()).toEqual(["Removed Ann from your shortlist."]);
    fireEvent.click(bookmark);
    expect(said()).toEqual(["Added Ann to your shortlist."]);
    openMenu("Ann");
    fireEvent.click(screen.getByRole("menuitem", { name: "Remove from shortlist" }));
    expect(said()).toEqual(["Removed Ann from your shortlist."]);
  });
});
