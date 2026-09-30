// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation, useNavigate } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SearchResult, TherapistCard } from "@shared/types";
import { TooltipProvider } from "@/components/ui/tooltip";
import { api } from "@/lib/api";
import { listed } from "@/lib/listed.testing";
import { createShortlistStore, type ShortlistStore } from "@/shortlist/store";
import { ShortlistContext } from "@/shortlist/useShortlist";
import type { Highlight } from "./map/highlight";
import { layoutPins, type Pin } from "./map/pins";
import { NO_PLACE } from "./SearchBox";
import { SearchPage } from "./SearchPage";

// Results keep the order they are answered in here; order.test.ts and useResults.test.tsx cover the order itself.
vi.mock("./order", () => ({ orderSeed: () => 0, inOrder: <T,>(listings: T[]) => listings }));

// Counted, to see whether a hover makes the page lay its pins out again.
vi.mock("./map/pins", async (importOriginal) => {
  const pins = await importOriginal<typeof import("./map/pins")>();
  return { ...pins, layoutPins: vi.fn(pins.layoutPins) };
});

// The map pane is tested on its own; here it shows what the page passed it, with a button for each pin and one that
// finds BN3 1FG in the middle of the map.
vi.mock("./map/MapPane", async () => {
  const { createElement, useSyncExternalStore } = await import("react");
  type Props = {
    label: string;
    fitKey: string;
    centreSettled: boolean;
    pins: Pin[];
    highlight: Highlight;
    selected?: Pin;
    onSelect: (pin: Pin) => void;
    onSearchArea: (postcode: string) => boolean;
    outsideUK?: boolean;
    coveredBelow?: (height: number) => number;
  };
  return {
    default: ({ label, fitKey, centreSettled, pins, highlight, selected, onSelect, onSearchArea, outsideUK, coveredBelow }: Props) => {
      const slug = useSyncExternalStore(highlight.subscribe, highlight.get);
      return createElement(
        "div",
        {
          role: "region",
          "aria-label": label,
          "data-testid": "map",
          "data-fit-key": fitKey,
          "data-settled": String(centreSettled),
          "data-highlighted": slug ?? "",
          "data-selected": selected?.key ?? "",
          "data-outside-uk": String(Boolean(outsideUK)),
          // As much of an 800px map as the sheet covers.
          "data-covered": coveredBelow?.(800) ?? "",
        },
        pins.map((pin) =>
          createElement(
            "button",
            { key: pin.key, type: "button", "data-who": pin.therapists.map((t) => t.slug).join(" "), onClick: () => onSelect(pin) },
            `Pin ${pin.key}`,
          ),
        ),
        createElement(
          "button",
          { type: "button", onClick: (event: { currentTarget: HTMLElement }) => (event.currentTarget.dataset.searched = String(onSearchArea("BN3 1FG"))) },
          "Search this area",
        ),
      );
    },
  };
});

/** Sets how wide the screen is; the function returned resizes it, telling the page as a real window would. */
function screenIs(wide: boolean) {
  const listeners = new Set<() => void>();
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: wide && query === "(min-width: 64rem)",
    media: query,
    addEventListener: (_: string, listener: () => void) => listeners.add(listener),
    removeEventListener: (_: string, listener: () => void) => listeners.delete(listener),
  }));
  return (next: boolean) => {
    wide = next;
    act(() => listeners.forEach((listener) => listener()));
  };
}

const therapist = (slug: string, location?: string): TherapistCard => ({ slug, name: `Therapist ${slug}`, initials: "T", tags: [], location });

/** The given pages of cards, or else thirty results twelve a page; no place is searched, so no centre is looked up. */
function answer(pages: TherapistCard[][]) {
  vi.spyOn(api, "search").mockImplementation(async (query) => {
    const page = Number(new URLSearchParams(query).get("page") ?? 1);
    if (pages.length > 0) {
      const before = pages.slice(0, page - 1).flat().length;
      const therapists = pages[page - 1] ?? [];
      return listed({ total: pages.flat().length, from: before + 1, to: before + therapists.length, notices: [], therapists });
    }
    const therapists = Array.from({ length: 12 }, (_, i) => therapist(`p${page}-${i}`));
    return listed({ total: 30, from: (page - 1) * 12 + 1, to: page * 12, notices: [], therapists });
  });
}

function Profile() {
  const navigate = useNavigate();
  return (
    <button type="button" onClick={() => navigate(-1)}>
      Back
    </button>
  );
}

function Url() {
  const { pathname, search } = useLocation();
  return (
    <output data-testid="url" data-path={pathname}>
      {search}
    </output>
  );
}

/** The page's shortlist, empty at each test's start. Each addition is newer than the last, as a visitor's clicks are. */
let shortlist: ShortlistStore;
beforeEach(() => {
  let now = 0;
  shortlist = createShortlistStore(null, () => ++now);
});

function renderAt(url: string, ...pages: TherapistCard[][]) {
  answer(pages);
  renderPage(url);
}

function renderPage(url: string) {
  const page = (
    <>
      <SearchPage />
      <Url />
    </>
  );
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <ShortlistContext.Provider value={shortlist}>
        <TooltipProvider>
          <MemoryRouter initialEntries={[url]}>
            <Routes>
              <Route path="/" element={page} />
              <Route path="/online" element={page} />
              <Route path="/therapist/:slug" element={<Profile />} />
            </Routes>
          </MemoryRouter>
        </TooltipProvider>
      </ShortlistContext.Provider>
    </QueryClientProvider>,
  );
}

/** A search whose answer, with no "Location searched", has no centre to look up. */
const SEARCH = "/?Location=Leeds";
const url = () => new URLSearchParams(screen.getByTestId("url").textContent ?? "");
const path = () => screen.getByTestId("url").dataset.path;
const results = () => screen.getByRole("region", { name: "Results and shortlist" });
const loaded = () => within(results()).findByText(/^\d+ of 30/);
/** The side bar's scrolling list, which holds everything but its tabs and footer. */
const list = () => results().querySelector<HTMLElement>(".overflow-y-auto")!;
const names = () => within(results()).getAllByRole("link", { name: /^Therapist/ }).map((link) => link.textContent);
/** Gives the lazily loaded map time to arrive, were the page to ask for it. */
const mapLoads = () => act(async () => void (await import("./map/MapPane")));

const BRIGHTON = { lat: 50.8225, lng: -0.1372 };
const HOVE = { lat: 50.835, lng: -0.178 };
/** A pin's key, as the pins make it from its point. */
const key = ({ lat, lng }: { lat: number; lng: number }) => `${lat.toFixed(5)},${lng.toFixed(5)}`;
const map = () => screen.getByTestId("map");
/** Each pin on the map, with who is on it. */
const mapPins = () => within(map()).queryAllByRole("button", { name: /^Pin / }).map((pin) => `${pin.textContent}: ${pin.dataset.who}`);
/** Places a location by its postal district alone: BN3 in Hove, anywhere else in Brighton. */
function placeByDistrict() {
  vi.spyOn(api, "place").mockImplementation(async (text) => ({ found: true, kind: "outcode", candidates: [text.endsWith("BN3") ? HOVE : BRIGHTON] }));
}

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("SearchPage", () => {
  it("sets the results beside the map on wide screens, and can put them away", async () => {
    screenIs(true);
    renderAt(SEARCH);
    await loaded();
    expect(await screen.findByTestId("map")).toBeTruthy();
    const toolbar = () => screen.getByRole("button", { name: "Filters" }).closest(".absolute")!;
    fireEvent.click(screen.getByRole("button", { name: "Hide list" }));
    expect(results().closest("[inert]")).not.toBeNull();
    // The toolbar stands aside for the toggle left over the map's top left.
    expect(toolbar().className).toContain("left-14");
    fireEvent.click(screen.getByRole("button", { name: "Show list" }));
    expect(results().closest("[inert]")).toBeNull();
    expect(toolbar().className).not.toContain("left-14");
  });

  it("asks for a search in place of the results, with no map, when there is nothing to search for", async () => {
    screenIs(true);
    renderAt("/");
    await mapLoads();
    expect(within(results()).getByText(/^Search a town, city or postcode/)).toBeTruthy();
    expect(screen.getByRole("tab", { name: "Results" }).getAttribute("aria-selected")).toBe("true");
    expect(screen.getByRole("heading", { level: 1, name: "Find a UKCP therapist" })).toBeTruthy();
    expect(screen.queryByTestId("map")).toBeNull();
    expect(api.search).not.toHaveBeenCalled();
    fireEvent.change(screen.getByRole("textbox", { name: "Location" }), { target: { value: "York" } });
    fireEvent.click(screen.getByRole("button", { name: "Search" }));
    await loaded();
    expect(await screen.findByTestId("map")).toBeTruthy();
    expect(screen.queryByText(/^Search a town, city or postcode/)).toBeNull();
  });

  it("lets the map leave the UK only for a search outside it", async () => {
    screenIs(true);
    renderAt(SEARCH);
    await loaded();
    expect((await screen.findByTestId("map")).dataset.outsideUk).toBe("false");
    cleanup();
    renderAt("/?Location=Paris&LocationSearchOutsideUK=true");
    await loaded();
    expect((await screen.findByTestId("map")).dataset.outsideUk).toBe("true");
  });

  it("searches nothing until there is a place, keeping the ticks and keyword for the first one searched", async () => {
    screenIs(true);
    renderAt("/?Languages=French&KeywordFilter=grief&LocationSearchOutsideUK=true");
    await mapLoads();
    expect(screen.getByText(/^Search a town, city or postcode/)).toBeTruthy();
    expect(screen.queryByTestId("map")).toBeNull();
    expect(screen.getByRole("button", { name: "Remove French" })).toBeTruthy();
    expect(api.search).not.toHaveBeenCalled();
    fireEvent.change(screen.getByRole("textbox", { name: "Location" }), { target: { value: "Paris" } });
    fireEvent.click(screen.getByRole("button", { name: "Search" }));
    await loaded();
    expect(vi.mocked(api.search).mock.lastCall?.[0]).toBe("Location=Paris&KeywordFilter=grief&Languages=French&LocationSearchOutsideUK=true");
  });

  it("goes back to the prompt in place of the map and results when the search is cleared, and opens the next search on its list", async () => {
    screenIs(false);
    renderAt(SEARCH);
    await loaded();
    expect(await screen.findByTestId("map")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Show map" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Location" }), { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: "Filters" }));
    fireEvent.click(await screen.findByRole("button", { name: "Clear all filters" }));
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(within(results()).getByText(/^Search a town, city or postcode/)).toBeTruthy();
    expect(screen.queryByTestId("map")).toBeNull();
    fireEvent.change(screen.getByRole("textbox", { name: "Location" }), { target: { value: "York" } });
    fireEvent.click(screen.getByRole("button", { name: "Search" }));
    expect(results().dataset.position).toBe("full");
    await loaded();
  });

  it("asks for a place rather than searching with the box emptied, leaving the search as it was", async () => {
    screenIs(true);
    renderAt(SEARCH);
    await loaded();
    fireEvent.change(screen.getByRole("textbox", { name: "Location" }), { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: "Search" }));
    expect(screen.getByRole("alert").textContent).toBe(NO_PLACE);
    expect(url().get("Location")).toBe("Leeds");
    expect(results()).toBeTruthy();
  });

  it("leaves a search that nothing changes where it was, asking UKCP nothing more", async () => {
    screenIs(true);
    renderAt(SEARCH);
    await loaded();
    list().scrollTop = 400;
    fireEvent.scroll(list());
    fireEvent.change(screen.getByRole("textbox", { name: "Location" }), { target: { value: " Leeds " } });
    fireEvent.click(screen.getByRole("button", { name: "Search" }));
    fireEvent.click(screen.getByRole("button", { name: "Filters" }));
    fireEvent.click(screen.getByRole("button", { name: "Clear all filters" }));
    await loaded();
    expect(list().scrollTop).toBe(400);
    expect(api.search).toHaveBeenCalledOnce();
  });

  it("keeps Load more beneath the list rather than at its end", async () => {
    screenIs(true);
    renderAt(SEARCH);
    await loaded();
    const more = screen.getByRole("button", { name: "Load more" });
    expect(results().contains(more)).toBe(true);
    expect(list().contains(more)).toBe(false);
  });

  it("says a searched place's results are within its area", async () => {
    screenIs(true);
    vi.spyOn(api, "place").mockResolvedValue({ found: true, kind: "place", candidates: [{ lat: 53.8, lng: -1.55 }] });
    vi.spyOn(api, "search").mockResolvedValue(listed({ total: 1, from: 1, to: 1, notices: [], therapists: [therapist("a")], locationSearched: "Leeds, UK" }));
    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <TooltipProvider>
          <MemoryRouter initialEntries={[SEARCH]}>
            <SearchPage />
          </MemoryRouter>
        </TooltipProvider>
      </QueryClientProvider>,
    );
    expect(await screen.findByRole("heading", { name: "1 result within your area" })).toBeTruthy();
  });

  it("lays the results over the map on narrow screens, starting on the list", async () => {
    screenIs(false);
    renderAt(SEARCH);
    await loaded();
    expect(results().dataset.position).toBe("full");
    fireEvent.click(screen.getByRole("button", { name: "Show map" }));
    expect(results().dataset.position).toBe("peek");
  });

  it("opens the filters beneath the search box on wide screens", async () => {
    screenIs(true);
    renderAt(SEARCH);
    await loaded();
    fireEvent.click(screen.getByRole("button", { name: "Filters" }));
    expect(screen.getByRole("region", { name: "Refine your search" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Close filters" }));
    expect(screen.queryByRole("region", { name: "Refine your search" })).toBeNull();
  });

  it("keeps the filters open right of the prompt on wide screens, as they are set, until a search for a place puts them away", async () => {
    screenIs(true);
    renderAt("/");
    const filters = () => screen.queryByRole("region", { name: "Refine your search" });
    expect(results().compareDocumentPosition(filters()!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Filters" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Close filters" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Search" }));
    expect(filters()).toBeTruthy();
    const keyword = screen.getByRole("searchbox", { name: "Keyword search" });
    fireEvent.change(keyword, { target: { value: "grief" } });
    fireEvent.submit(keyword.closest("form")!);
    expect(url().get("KeywordFilter")).toBe("grief");
    expect(screen.getByText(/^Search a town, city or postcode/)).toBeTruthy();
    expect(filters()).toBeTruthy();
    const box = screen.getByRole("textbox", { name: "Location" });
    box.focus();
    fireEvent.change(box, { target: { value: "York" } });
    fireEvent.submit(box.closest("form")!);
    expect(filters()).toBeNull();
    // The toolbar moves over the map rather than being drawn afresh there.
    expect(document.activeElement).toBe(box);
    await loaded();
    expect(api.search).toHaveBeenCalledOnce();
  });

  it("leaves the filters open over the map, and the keyboard where it was in them, when a tick beside the prompt starts a search", async () => {
    screenIs(true);
    renderAt("/");
    const filters = () => screen.getByRole("region", { name: "Refine your search" });
    fireEvent.change(screen.getByRole("textbox", { name: "Location" }), { target: { value: "York" } });
    fireEvent.click(within(filters()).getByRole("button", { name: /^Languages/ }));
    const french = within(filters()).getByRole("checkbox", { name: "French" });
    french.focus();
    fireEvent.click(french);
    expect(url().toString()).toBe("Location=York&Languages=French");
    await loaded();
    expect(await screen.findByTestId("map")).toBeTruthy();
    expect(document.activeElement).toBe(french);
    expect(screen.getByRole("button", { name: "Close filters" })).toBeTruthy();
  });

  it.each([
    { screen: "wide", wide: true, close: "Close filters" },
    { screen: "narrow", wide: false, close: "Close" },
  ])("keeps the filters' heading and close button still as they scroll on $screen screens", async ({ wide, close }) => {
    screenIs(wide);
    renderAt(SEARCH);
    await loaded();
    fireEvent.click(screen.getByRole("button", { name: "Filters" }));
    const body = (await screen.findByRole("searchbox", { name: "Keyword search" })).closest(".overflow-y-auto");
    expect(body?.contains(screen.getByRole("heading", { name: "Refine your search" }))).toBe(false);
    expect(body?.contains(screen.getByRole("button", { name: close }))).toBe(false);
  });

  it("sets the toolbar above the list's tabs on a phone before a search, handing the keyboard to the search's list as it begins", async () => {
    screenIs(false);
    shortlist.add(therapist("a"));
    renderAt("/");
    await mapLoads();
    expect(within(results()).getByText(/^Search a town, city or postcode/)).toBeTruthy();
    expect(screen.queryByTestId("map")).toBeNull();
    const box = screen.getByRole("textbox", { name: "Location" });
    expect(box.compareDocumentPosition(screen.getByRole("tablist")) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getAllByRole("heading", { level: 1, name: "Find a UKCP therapist" })).toHaveLength(1);
    pick(/^Shortlist/);
    expect(within(screen.getByRole("tabpanel", { name: /^Shortlist/ })).getByRole("link", { name: "Therapist a" })).toBeTruthy();
    box.focus();
    fireEvent.change(box, { target: { value: "York" } });
    fireEvent.submit(box.closest("form")!);
    const tab = screen.getByRole("tab", { name: "Results" });
    expect(tab.getAttribute("aria-selected")).toBe("true");
    expect(document.activeElement).toBe(tab);
    expect(results().dataset.position).toBe("full");
    await loaded();
  });

  it("keeps a phone's filters sheet open, and the keyboard in it, when a tick there starts a search from the prompt", async () => {
    const resize = screenIs(false);
    renderAt("/");
    fireEvent.change(screen.getByRole("textbox", { name: "Location" }), { target: { value: "York" } });
    fireEvent.click(screen.getByRole("button", { name: "Filters" }));
    const sheet = await screen.findByRole("dialog", { name: "Refine your search" });
    fireEvent.click(within(sheet).getByRole("button", { name: /^Languages/ }));
    const french = within(sheet).getByRole("checkbox", { name: "French" });
    french.focus();
    fireEvent.click(french);
    expect(url().toString()).toBe("Location=York&Languages=French");
    expect(await screen.findByTestId("map")).toBeTruthy();
    expect(screen.getByRole("dialog", { name: "Refine your search" })).toBe(sheet);
    expect(document.activeElement).toBe(french);
    await waitFor(() => expect(api.search).toHaveBeenCalledOnce());
    // Widened, the sheet goes, and the filters stay shut over the map, as they were never open there.
    resize(true);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.queryByRole("region", { name: "Refine your search" })).toBeNull();
  });

  it("leaves the outside-UK tick out of the Filters count, as Clear all keeps it", async () => {
    screenIs(true);
    renderAt(`${SEARCH}&LocationSearchOutsideUK=true&Languages=French`);
    expect(screen.getByRole("button", { name: "Filters, 1 ticked" })).toBeTruthy();
    await loaded();
  });

  it("opens the filters in a sheet from the right on narrow screens", async () => {
    screenIs(false);
    renderAt(SEARCH);
    await loaded();
    fireEvent.click(screen.getByRole("button", { name: "Filters" }));
    expect((await screen.findByRole("dialog", { name: "Refine your search" })).dataset.side).toBe("right");
  });

  it("searches from the box with the typed keyword", async () => {
    screenIs(true);
    renderAt(SEARCH);
    await loaded();
    fireEvent.click(screen.getByRole("button", { name: "Filters" }));
    fireEvent.change(screen.getByRole("searchbox", { name: "Keyword search" }), { target: { value: "grief" } });
    fireEvent.change(screen.getByRole("textbox", { name: "Location" }), { target: { value: "York" } });
    fireEvent.click(screen.getByRole("button", { name: "Search" }));
    expect([url().get("Location"), url().get("KeywordFilter")]).toEqual(["York", "grief"]);
    await loaded();
  });

  it("searches the postcode the map finds in its middle, with the typed keyword and the ticks, putting the filters away", async () => {
    screenIs(true);
    renderAt("/?Location=Leeds&Languages=French");
    await loaded();
    fireEvent.click(screen.getByRole("button", { name: "Filters, 1 ticked" }));
    fireEvent.change(screen.getByRole("searchbox", { name: "Keyword search" }), { target: { value: "grief" } });
    const searchArea = await screen.findByRole("button", { name: "Search this area" });
    fireEvent.click(searchArea);
    expect(searchArea.dataset.searched).toBe("true");
    expect([url().get("Location"), url().get("KeywordFilter"), url().get("Languages")]).toEqual(["BN3 1FG", "grief", "French"]);
    expect(screen.getByRole<HTMLInputElement>("textbox", { name: "Location" }).value).toBe("BN3 1FG");
    expect(screen.queryByRole("region", { name: "Refine your search" })).toBeNull();
    await loaded();
  });

  it("tells the map when the postcode it finds is the one already searched, however it was typed", async () => {
    screenIs(true);
    renderAt("/?Location=bn3%201fg");
    await loaded();
    const searchArea = await screen.findByRole("button", { name: "Search this area" });
    fireEvent.click(searchArea);
    expect(searchArea.dataset.searched).toBe("false");
    expect(url().get("Location")).toBe("bn3 1fg");
  });

  it("holds the map's framing until a first search arrives", async () => {
    screenIs(true);
    let arrive: (result: SearchResult) => void = () => {};
    answer([]);
    vi.mocked(api.search).mockImplementationOnce(() => new Promise((resolve) => (arrive = (result) => resolve(listed(result)))));
    renderAt(SEARCH);
    expect((await screen.findByTestId("map")).dataset.settled).toBe("false");
    await act(async () => arrive({ total: 1, from: 1, to: 1, notices: [], therapists: [therapist("york")] }));
    await within(results()).findByText(/^1 of 1/);
    expect(screen.getByTestId("map").dataset.settled).toBe("true");
  });

  it("settles the map's framing when a first search fails, so the map is not left waiting", async () => {
    screenIs(true);
    answer([]);
    vi.mocked(api.search).mockRejectedValueOnce(new Error("UKCP answered 503"));
    renderAt(SEARCH);
    await waitFor(() => expect(screen.getByTestId("map").dataset.settled).toBe("true"));
  });

  it("holds the map's framing while a new search loads, as what it shows is still the last search's", async () => {
    screenIs(true);
    renderAt(SEARCH);
    await loaded();
    expect((await screen.findByTestId("map")).dataset.settled).toBe("true");
    let arrive: (result: SearchResult) => void = () => {};
    vi.mocked(api.search).mockImplementationOnce(() => new Promise((resolve) => (arrive = (result) => resolve(listed(result)))));
    fireEvent.change(screen.getByRole("textbox", { name: "Location" }), { target: { value: "York" } });
    fireEvent.click(screen.getByRole("button", { name: "Search" }));
    expect(screen.getByTestId("map").dataset.settled).toBe("false");
    await act(async () => arrive({ total: 1, from: 1, to: 1, notices: [], therapists: [therapist("york")] }));
    await within(results()).findByText(/^1 of 1/);
    expect(screen.getByTestId("map").dataset.settled).toBe("true");
  });

  it("returns to the same place in the list after Back from a profile", async () => {
    screenIs(true);
    renderAt(SEARCH);
    await loaded();
    list().scrollTop = 400;
    fireEvent.scroll(list());
    fireEvent.click(screen.getByRole("link", { name: "Therapist p1-3" }));
    fireEvent.click(await screen.findByRole("button", { name: "Back" }));
    await screen.findByRole("region", { name: "Results and shortlist" });
    await loaded();
    expect(list().scrollTop).toBe(400);
  });

  it("keeps the same place in the list as the window crosses between wide and narrow", async () => {
    const resize = screenIs(true);
    renderAt(SEARCH);
    await loaded();
    list().scrollTop = 400;
    fireEvent.scroll(list());
    resize(false);
    expect(results().dataset.position).toBe("full");
    expect(list().scrollTop).toBe(400);
    resize(true);
    expect(results().dataset.position).toBeUndefined();
    expect(list().scrollTop).toBe(400);
  });

  it("heads an invalid search link with the site's name, marked as an error", () => {
    renderAt("/?OnlyProfilesWithPhotos=yes");
    const alert = screen.getByRole("alert");
    expect(alert.textContent).toContain("This search link isn't valid");
    expect(alert.querySelector("svg")?.classList.contains("lucide-circle-alert")).toBe(true);
    expect(screen.getByRole("heading", { level: 1, name: "Find a UKCP therapist" })).toBeTruthy();
  });

  it("heads the side bar with the site's name and theme switch, which hide with the results", async () => {
    screenIs(true);
    renderAt(SEARCH);
    await loaded();
    expect(screen.getByRole("heading", { level: 1, name: "Find a UKCP therapist" })).toBeTruthy();
    expect(screen.getByRole("group", { name: "Theme" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Hide list" }));
    expect(screen.getByRole("heading", { level: 1 }).closest("[inert]")).not.toBeNull();
    expect(screen.getByRole("group", { name: "Theme" }).closest("[inert]")).not.toBeNull();
  });

  it("heads the list in the sheet with the site's name and theme switch on narrow screens", async () => {
    screenIs(false);
    renderAt(SEARCH);
    await loaded();
    expect(within(list()).getByRole("heading", { level: 1, name: "Find a UKCP therapist" })).toBeTruthy();
    expect(within(list()).getByRole("group", { name: "Theme" })).toBeTruthy();
  });

  it("names the filters button's ticks for screen readers", async () => {
    screenIs(true);
    renderAt(`${SEARCH}&Languages=French`);
    expect(await screen.findByRole("button", { name: "Filters, 1 ticked" })).toBeTruthy();
  });

  it("counts the therapists the map can't place, whether their location is too vague or matches nothing", async () => {
    screenIs(true);
    vi.spyOn(api, "place").mockImplementation(async (text) =>
      text.includes("NOWHERE") ? { found: false, reason: "not-found" } : { found: true, kind: "outcode", candidates: [{ lat: 50.83, lng: -0.15 }] },
    );
    renderAt(SEARCH, [therapist("a", "BRIGHTON BN3"), therapist("b", " BN"), therapist("c", "NOWHERE")]);
    expect(await within(results()).findByText("3 of 3 · 2 not on the map")).toBeTruthy();
    expect(within(results()).getByText("Pins show the postcode or area each therapist lists.")).toBeTruthy();
  });

  it("gathers everyone at a pin under the place they list, where the first of them comes", async () => {
    screenIs(true);
    placeByDistrict();
    renderAt(SEARCH, [therapist("a", "BRIGHTON BN3"), therapist("b", "BRIGHTON BN1"), therapist("c", "Hove BN3")]);
    const here = await within(results()).findByRole("group", { name: "BN3 2 therapists" });
    expect(within(here).getAllByRole("heading").map((h) => [h.tagName, h.textContent])).toEqual([
      ["H2", "BN3 · 2 therapists"],
      ["H3", "Therapist a"],
      ["H3", "Therapist c"],
    ]);
    expect(names()).toEqual(["Therapist a", "Therapist c", "Therapist b"]);
  });

  it("tells the map how much of it the sheet covers on narrow screens, counting the list as lowered to show the map", async () => {
    screenIs(false);
    placeByDistrict();
    renderAt(SEARCH, [therapist("a", "Hove BN3")]);
    const pin = await screen.findByRole("button", { name: `Pin ${key(HOVE)}` });
    expect(results().dataset.position).toBe("full");
    expect(screen.getByTestId("map").dataset.covered).toBe("56");
    fireEvent.click(screen.getByRole("button", { name: "Show map" }));
    fireEvent.click(pin);
    expect(results().dataset.position).toBe("half");
    expect(screen.getByTestId("map").dataset.covered).toBe("400");
  });

  it("leaves the map wholly uncovered on wide screens", async () => {
    screenIs(true);
    renderAt(SEARCH);
    await loaded();
    expect(screen.getByTestId("map").dataset.covered).toBe("");
  });

  it("marks a selected pin's place in the list until the pin is activated again, raising the sheet halfway", async () => {
    screenIs(false);
    placeByDistrict();
    renderAt(SEARCH, [therapist("a", "BRIGHTON BN3"), therapist("b", "BRIGHTON BN1"), therapist("c", "Hove BN3")]);
    fireEvent.click(screen.getByRole("button", { name: "Show map" }));
    const here = await within(results()).findByRole("group", { name: "BN3 2 therapists" });
    const pin = screen.getByRole("button", { name: `Pin ${key(HOVE)}` });
    fireEvent.click(pin);
    expect(here.closest("li")?.getAttribute("aria-current")).toBe("true");
    expect(results().dataset.position).toBe("half");
    expect(screen.getByTestId("map").dataset.selected).toBe(key(HOVE));
    fireEvent.click(pin);
    expect(here.closest("li")?.hasAttribute("aria-current")).toBe(false);
    expect(screen.getByTestId("map").dataset.selected).toBe("");
    // A therapist on their own is marked just the same.
    fireEvent.click(screen.getByRole("button", { name: `Pin ${key(BRIGHTON)}` }));
    expect(screen.getByRole("link", { name: "Therapist b" }).closest("li")?.getAttribute("aria-current")).toBe("true");
  });

  it("scrolls a selected pin's place into view, unless it is in view already", async () => {
    screenIs(true);
    placeByDistrict();
    renderAt(SEARCH, [therapist("a", "BRIGHTON BN1"), therapist("b", "Hove BN3"), therapist("c", "Hove BN3")]);
    await within(results()).findByRole("group", { name: "Hove BN3 2 therapists" });
    const scrollTo = vi.fn();
    Object.defineProperty(list(), "scrollTo", { value: scrollTo });
    const box = (top: number, bottom: number) => ({ top, bottom }) as DOMRect;
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
      if (this === list()) return box(100, 500);
      return this.dataset.pin === key(HOVE) ? box(700, 900) : box(120, 300);
    });
    list().scrollTop = 50;
    fireEvent.click(screen.getByRole("button", { name: `Pin ${key(BRIGHTON)}` }));
    expect(scrollTo).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: `Pin ${key(HOVE)}` }));
    expect(scrollTo).toHaveBeenLastCalledWith({ top: 50 + 700 - 100 - 8, behavior: "smooth" });
    // A list the selection opens starts at the entry rather than gliding there.
    fireEvent.click(screen.getByRole("button", { name: `Pin ${key(HOVE)}` }));
    fireEvent.click(screen.getByRole("button", { name: "Hide list" }));
    fireEvent.click(screen.getByRole("button", { name: `Pin ${key(HOVE)}` }));
    expect(scrollTo).toHaveBeenLastCalledWith({ top: 50 + 700 - 100 - 8, behavior: "auto" });
  });

  it("gathers whoever joins a pin as more results load into its place in the list", async () => {
    screenIs(true);
    placeByDistrict();
    renderAt(SEARCH, [therapist("a", "BRIGHTON BN3"), therapist("b", "BRIGHTON BN1")], [therapist("c", "Hove BN3"), therapist("d", "BRIGHTON BN3")]);
    await within(results()).findByText("2 of 4");
    expect(names()).toEqual(["Therapist a", "Therapist b"]);
    fireEvent.click(screen.getByRole("button", { name: "Load more" }));
    await within(results()).findByRole("group", { name: "BN3 3 therapists" });
    expect(names()).toEqual(["Therapist a", "Therapist c", "Therapist d", "Therapist b"]);
  });

  it("rings the pin of the card in focus", async () => {
    screenIs(true);
    renderAt(SEARCH);
    const card = await screen.findByRole("link", { name: "Therapist p1-2" });
    act(() => card.focus());
    expect((await screen.findByTestId("map")).dataset.highlighted).toBe("p1-2");
  });

  it("rings a hovered card's pin without laying the pins out again", async () => {
    screenIs(true);
    renderAt(SEARCH);
    const card = await screen.findByRole("link", { name: "Therapist p1-2" });
    await screen.findByTestId("map");
    const laidOut = vi.mocked(layoutPins).mock.calls.length;
    fireEvent.pointerEnter(card.closest("[data-slot=card]") as HTMLElement);
    expect(screen.getByTestId("map").dataset.highlighted).toBe("p1-2");
    expect(vi.mocked(layoutPins).mock.calls.length).toBe(laidOut);
  });

  it("forgets a hovered card when a new search replaces the list, even one listing the same therapist", async () => {
    screenIs(true);
    renderAt(SEARCH);
    const card = await screen.findByRole("link", { name: "Therapist p1-2" });
    await screen.findByTestId("map");
    fireEvent.pointerEnter(card.closest("[data-slot=card]") as HTMLElement);
    expect(screen.getByTestId("map").dataset.highlighted).toBe("p1-2");
    let arrive: (result: SearchResult) => void = () => {};
    vi.mocked(api.search).mockImplementationOnce(() => new Promise((resolve) => (arrive = (result) => resolve(listed(result)))));
    fireEvent.change(screen.getByRole("textbox", { name: "Location" }), { target: { value: "York" } });
    fireEvent.click(screen.getByRole("button", { name: "Search" }));
    await act(async () => arrive({ total: 1, from: 1, to: 1, notices: [], therapists: [therapist("p1-2")] }));
    await within(results()).findByText(/^1 of 1/);
    expect(screen.getByTestId("map").dataset.highlighted).toBe("");
  });

  // Radix tabs switch on the mousedown that begins a click.
  function pick(name: string | RegExp) {
    const tab = screen.getByRole("tab", { name });
    fireEvent.mouseDown(tab);
    fireEvent.click(tab);
  }

  it("keeps the shortlist in a tab beside the results, counting who is on it", async () => {
    screenIs(true);
    renderAt(SEARCH);
    await loaded();
    fireEvent.click(screen.getByRole("button", { name: "Add Therapist p1-3 to your shortlist" }));
    pick("Shortlist, 1 therapist");
    const shortlist = screen.getByRole("tabpanel", { name: /^Shortlist/ });
    expect(within(shortlist).getByRole("link", { name: "Therapist p1-3" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Load more" })).toBeNull();
    pick("Results");
    await loaded();
    expect(screen.getByRole("button", { name: "Load more" })).toBeTruthy();
  });

  it("keeps each tab's own place in the list", async () => {
    screenIs(true);
    renderAt(SEARCH);
    await loaded();
    // As in a browser, the list scrolls no further than its content: with no entries in it, not at all.
    let top = 0;
    Object.defineProperty(list(), "scrollTop", {
      configurable: true,
      get: () => top,
      set: (value: number) => (top = list().querySelector("li") ? value : 0),
    });
    list().scrollTop = 400;
    fireEvent.scroll(list());
    pick(/^Shortlist/);
    expect(list().scrollTop).toBe(0);
    pick("Results");
    expect(list().scrollTop).toBe(400);
  });

  it("goes back to the results for a new search", async () => {
    screenIs(true);
    renderAt(SEARCH);
    await loaded();
    pick(/^Shortlist/);
    fireEvent.change(screen.getByRole("textbox", { name: "Location" }), { target: { value: "York" } });
    fireEvent.click(screen.getByRole("button", { name: "Search" }));
    expect(screen.getByRole("tab", { name: "Results" }).getAttribute("aria-selected")).toBe("true");
    await loaded();
  });

  it("maps the shortlist alone while its tab is open, framed apart from the results", async () => {
    screenIs(true);
    placeByDistrict();
    shortlist.add(therapist("c", "Hove BN3"));
    renderAt(SEARCH, [therapist("a", "BRIGHTON BN1"), therapist("b", "Hove BN3")]);
    await waitFor(() => expect(mapPins()).toEqual([`Pin ${key(BRIGHTON)}: a`, `Pin ${key(HOVE)}: b`]));
    const framed = map().dataset.fitKey;
    expect(screen.getByRole("region", { name: "Map of results" })).toBe(map());
    pick(/^Shortlist/);
    await waitFor(() => expect(mapPins()).toEqual([`Pin ${key(HOVE)}: c`]));
    expect(map().dataset.fitKey).not.toBe(framed);
    expect(screen.getByRole("region", { name: "Map of your shortlist" })).toBe(map());
    pick("Results");
    expect(mapPins()).toEqual([`Pin ${key(BRIGHTON)}: a`, `Pin ${key(HOVE)}: b`]);
    expect(map().dataset.fitKey).toBe(framed);
  });

  it("takes a therapist's pin off the map as they leave the shortlist, though their card stays to put them back", async () => {
    screenIs(true);
    placeByDistrict();
    shortlist.add(therapist("c", "Hove BN3"));
    shortlist.add(therapist("d", "BRIGHTON BN1"));
    renderAt(SEARCH, [therapist("a", "BRIGHTON BN1")]);
    await within(results()).findByRole("link", { name: "Therapist a" });
    pick(/^Shortlist/);
    await waitFor(() => expect(mapPins()).toEqual([`Pin ${key(BRIGHTON)}: d`, `Pin ${key(HOVE)}: c`]));
    fireEvent.click(screen.getByRole("button", { name: "Remove Therapist d from your shortlist" }));
    expect(mapPins()).toEqual([`Pin ${key(HOVE)}: c`]);
    fireEvent.click(screen.getByRole("button", { name: "Add Therapist d to your shortlist" }));
    expect(mapPins()).toEqual([`Pin ${key(BRIGHTON)}: d`, `Pin ${key(HOVE)}: c`]);
  });

  it("looks up the shortlist's places only once the map shows it", async () => {
    screenIs(true);
    placeByDistrict();
    shortlist.add(therapist("c", "Worthing BN11"));
    renderAt(SEARCH, [therapist("a", "BRIGHTON BN1")]);
    await within(results()).findByRole("link", { name: "Therapist a" });
    await mapLoads();
    await waitFor(() => expect(mapPins()).toEqual([`Pin ${key(BRIGHTON)}: a`]));
    const looked = () => vi.mocked(api.place).mock.calls.map(([text]) => text);
    expect(looked()).toEqual(["BRIGHTON BN1"]);
    pick(/^Shortlist/);
    await waitFor(() => expect(mapPins()).toEqual([`Pin ${key(BRIGHTON)}: c`]));
    expect(looked()).toEqual(["BRIGHTON BN1", "WORTHING BN11"]);
  });

  it("places the shortlist without regard to the search's centre, as it gathers therapists from any search", async () => {
    screenIs(true);
    const LEEDS = { lat: 53.8, lng: -1.55 };
    const INVERNESS = { lat: 57.48, lng: -4.22 };
    vi.spyOn(api, "place").mockImplementation(async (_, options) => ({ found: true, kind: "place", candidates: [options?.centre ? LEEDS : INVERNESS] }));
    vi.spyOn(api, "search").mockResolvedValue(
      listed({ total: 1, from: 1, to: 1, notices: [], therapists: [therapist("a", "Inverness")], locationSearched: "Leeds, UK" }),
    );
    shortlist.add(therapist("c", "Inverness"));
    renderPage(SEARCH);
    // Too far from the search's centre to be where its therapist is.
    expect(await within(results()).findByText("Nearest 1 of 1 · 1 not on the map")).toBeTruthy();
    pick(/^Shortlist/);
    await waitFor(() => expect(mapPins()).toEqual([`Pin ${key(INVERNESS)}: c`]));
  });

  it("reads the shortlist's places as UK places, even beside a search outside the UK", async () => {
    screenIs(true);
    placeByDistrict();
    shortlist.add(therapist("c", "Worthing BN11"));
    renderAt(`${SEARCH}&LocationSearchOutsideUK=true`, [therapist("a", "BRIGHTON BN1")]);
    await within(results()).findByRole("link", { name: "Therapist a" });
    await mapLoads();
    await waitFor(() => expect(mapPins()).toEqual([`Pin ${key(BRIGHTON)}: a`]));
    pick(/^Shortlist/);
    await waitFor(() => expect(mapPins()).toEqual([`Pin ${key(BRIGHTON)}: c`]));
    expect(vi.mocked(api.place).mock.calls).toEqual([
      ["BRIGHTON BN1", { outsideUK: true }],
      ["WORTHING BN11", { outsideUK: false }],
    ]);
  });

  it("raises a lowered sheet halfway to mark a shortlist pin's therapists, starting the list at them", async () => {
    screenIs(false);
    placeByDistrict();
    shortlist.add(therapist("c", "Hove BN3"));
    renderAt(SEARCH, [therapist("a", "BRIGHTON BN1")]);
    await within(results()).findByRole("link", { name: "Therapist a" });
    pick(/^Shortlist/);
    fireEvent.click(screen.getByRole("button", { name: "Show map" }));
    const pin = await screen.findByRole("button", { name: `Pin ${key(HOVE)}` });
    const scrollTo = vi.fn();
    Object.defineProperty(list(), "scrollTo", { value: scrollTo });
    const box = (top: number, bottom: number) => ({ top, bottom }) as DOMRect;
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
      return this === list() ? box(100, 500) : box(700, 900);
    });
    fireEvent.click(pin);
    expect(results().dataset.position).toBe("half");
    expect(screen.getByRole("tab", { name: /^Shortlist/ }).getAttribute("aria-selected")).toBe("true");
    expect(screen.getByRole("link", { name: "Therapist c" }).closest("li")?.getAttribute("aria-current")).toBe("true");
    expect(scrollTo).toHaveBeenLastCalledWith({ top: 700 - 100 - 8, behavior: "auto" });
  });

  it("marks a shortlist pin's therapists in the shortlist, which stays open, until the pin is activated again", async () => {
    screenIs(true);
    placeByDistrict();
    shortlist.add(therapist("c", "Hove BN3"));
    shortlist.add(therapist("d", "BRIGHTON BN1"));
    shortlist.add(therapist("e", "Hove BN3"));
    renderAt(SEARCH, [therapist("a", "Hove BN3")]);
    await within(results()).findByRole("link", { name: "Therapist a" });
    pick(/^Shortlist/);
    const pin = await screen.findByRole("button", { name: `Pin ${key(HOVE)}` });
    const marked = () =>
      within(screen.getByRole("tabpanel", { name: /^Shortlist/ }))
        .getAllByRole("link", { name: /^Therapist/ })
        .filter((link) => link.closest("li")?.getAttribute("aria-current") === "true")
        .map((link) => link.textContent);
    fireEvent.click(pin);
    expect(screen.getByRole("tab", { name: /^Shortlist/ }).getAttribute("aria-selected")).toBe("true");
    expect(marked()).toEqual(["Therapist e", "Therapist c"]);
    expect(map().dataset.selected).toBe(key(HOVE));
    fireEvent.click(pin);
    expect(marked()).toEqual([]);
    fireEvent.click(pin);
    expect(marked()).toEqual(["Therapist e", "Therapist c"]);
    // The results have a pin there too, which is not the one selected.
    pick("Results");
    expect(map().dataset.selected).toBe("");
  });

  it("scrolls to a selected pin's place in the shortlist rather than in the results hidden behind it", async () => {
    screenIs(true);
    placeByDistrict();
    shortlist.add(therapist("c", "Hove BN3"));
    renderAt(SEARCH, [therapist("a", "Hove BN3")]);
    await within(results()).findByRole("link", { name: "Therapist a" });
    pick(/^Shortlist/);
    const pin = await screen.findByRole("button", { name: `Pin ${key(HOVE)}` });
    const scrollTo = vi.fn();
    Object.defineProperty(list(), "scrollTo", { value: scrollTo });
    const box = (top: number, bottom: number) => ({ top, bottom }) as DOMRect;
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
      if (this === list()) return box(100, 500);
      return this.closest("[hidden]") ? box(120, 300) : box(700, 900);
    });
    fireEvent.click(pin);
    expect(scrollTo).toHaveBeenLastCalledWith({ top: 700 - 100 - 8, behavior: "smooth" });
  });

  it("rings the pin of a hovered shortlisted card", async () => {
    screenIs(true);
    shortlist.add(therapist("c"));
    renderAt(SEARCH);
    await loaded();
    pick(/^Shortlist/);
    const card = within(screen.getByRole("tabpanel", { name: /^Shortlist/ })).getByRole("link", { name: "Therapist c" });
    fireEvent.pointerEnter(card.closest("[data-slot=card]") as HTMLElement);
    expect(map().dataset.highlighted).toBe("c");
  });

  it("counts the shortlisted therapists the map can't place while it shows them", async () => {
    screenIs(true);
    placeByDistrict();
    shortlist.add(therapist("c", "Hove BN3"));
    shortlist.add(therapist("d", " BN"));
    renderAt(SEARCH);
    await loaded();
    pick(/^Shortlist/);
    expect(await screen.findByText("Kept in this browser only · 1 not on the map.")).toBeTruthy();
  });

  it("raises a lowered sheet to show the tab picked, or the one already open", async () => {
    screenIs(false);
    renderAt(SEARCH);
    await loaded();
    fireEvent.click(screen.getByRole("button", { name: "Show map" }));
    pick(/^Shortlist/);
    expect(results().dataset.position).toBe("full");
    expect(screen.getByRole("tabpanel", { name: /^Shortlist/ }).textContent).toMatch(/^Bookmark anyone who might suit you/);
    fireEvent.click(screen.getByRole("button", { name: "Show map" }));
    pick(/^Shortlist/);
    expect(results().dataset.position).toBe("full");
  });

  it("keeps the shortlist in a tab beside the prompt before a search", async () => {
    screenIs(true);
    placeByDistrict();
    shortlist.add(therapist("a", "BRIGHTON BN1"));
    renderAt("/");
    await mapLoads();
    expect(screen.queryByTestId("map")).toBeNull();
    pick(/^Shortlist/);
    expect(within(screen.getByRole("tabpanel", { name: /^Shortlist/ })).getByRole("link", { name: "Therapist a" })).toBeTruthy();
    // With no map, there is nothing to look their place up for or count them missing from.
    expect(screen.getByText("Kept in this browser only.")).toBeTruthy();
    expect(api.place).not.toHaveBeenCalled();
    expect(screen.getAllByRole("heading", { level: 1, name: "Find a UKCP therapist" })).toHaveLength(1);
    expect(api.search).not.toHaveBeenCalled();
  });
});

describe("SearchPage online", () => {
  const ONLINE = "/online";
  /** The search the page last asked UKCP for. */
  const asked = () => vi.mocked(api.search).mock.lastCall?.[0];
  const filters = () => screen.getByRole("region", { name: "Refine your search" });
  /** The online view narrowed by a filter, so it has something to search for. */
  const GREEK = `${ONLINE}?Languages=Greek`;
  const GREEK_ONLINE = "TypesOfSession=Online+Therapy&TypesOfSession=Telephone+Therapy&Languages=Greek";
  const prompt = () => screen.queryByText(/^Choose a filter to see/);

  it("lists everyone working online or by phone who matches its filters, with no place to search and no map", async () => {
    screenIs(true);
    renderAt(GREEK);
    await loaded();
    await mapLoads();
    expect(screen.queryByTestId("map")).toBeNull();
    expect(screen.queryByRole("textbox", { name: "Location" })).toBeNull();
    expect(asked()).toBe(GREEK_ONLINE);
    expect(within(results()).getByText("Only therapists who say they work online or by phone.")).toBeTruthy();
    expect(within(results()).queryByText(/^Pins show/)).toBeNull();
  });

  it("searches nothing until a filter besides online or phone narrows the search, and nothing again once it is removed", async () => {
    screenIs(true);
    renderAt(ONLINE);
    expect(prompt()).toBeTruthy();
    fireEvent.click(within(filters()).getByRole("button", { name: /^Type of Session/ }));
    fireEvent.click(within(filters()).getByRole("checkbox", { name: "Telephone Therapy" }));
    expect(url().toString()).toBe("TypesOfSession=Telephone+Therapy");
    expect(prompt()).toBeTruthy();
    expect(api.search).not.toHaveBeenCalled();
    fireEvent.click(within(filters()).getByRole("button", { name: /^Additional Filters/ }));
    fireEvent.click(within(filters()).getByRole("checkbox", { name: "Only show profiles with photos" }));
    await loaded();
    expect(prompt()).toBeNull();
    expect(asked()).toBe("TypesOfSession=Telephone+Therapy&OnlyProfilesWithPhotos=true");
    fireEvent.click(screen.getByRole("button", { name: "Remove Only show profiles with photos" }));
    expect(prompt()).toBeTruthy();
    expect(within(results()).queryByRole("link", { name: /^Therapist/ })).toBeNull();
    expect(api.search).toHaveBeenCalledOnce();
  });

  it("asks for no place, nor wheelchair access or a session type needing one, that a link carries", async () => {
    screenIs(true);
    renderAt(`${GREEK}&Location=Leeds&TypesOfSession=Face+to+Face+-+Long+Term&OnlyWheelchairAccessible=true`);
    await loaded();
    expect(asked()).toBe(GREEK_ONLINE);
    expect(screen.queryByRole("button", { name: "Remove Only show wheelchair accessible" })).toBeNull();
  });

  it("goes online from a search near a place, taking its filters, and comes back to the place", async () => {
    screenIs(true);
    renderAt("/?Location=Leeds&Languages=Greek&TypesOfSession=Face+to+Face+-+Long+Term&OnlyWheelchairAccessible=true");
    await loaded();
    expect(screen.getByRole("link", { name: "Near me" }).getAttribute("aria-current")).toBe("page");
    fireEvent.click(screen.getByRole("link", { name: "Online" }));
    expect([path(), url().toString()]).toEqual([ONLINE, "Languages=Greek"]);
    expect(screen.getByRole("link", { name: "Online" }).getAttribute("aria-current")).toBe("page");
    await loaded();
    fireEvent.click(screen.getByRole("link", { name: "Near me" }));
    expect([path(), url().toString()]).toEqual(["/", "Location=Leeds&Languages=Greek&OnlyWheelchairAccessible=true"]);
    await loaded();
  });

  it("keeps the keyboard on the switch as it changes the page", async () => {
    screenIs(true);
    renderAt(SEARCH);
    await loaded();
    fireEvent.click(screen.getByRole("link", { name: "Online" }));
    expect(document.activeElement).toBe(screen.getByRole("link", { name: "Online" }));
  });

  it("takes Near me back to the place last seen, however online was reached", async () => {
    screenIs(true);
    renderAt("/?Location=York");
    await loaded();
    cleanup();
    renderAt(ONLINE);
    expect(screen.getByRole("link", { name: "Near me" }).getAttribute("href")).toBe("/?Location=York");
  });

  it("picks out the same sought terms on the shortlist as in the results", async () => {
    screenIs(true);
    shortlist.add({ ...therapist("a"), tags: ["Online Therapy"] });
    renderAt(GREEK, [{ ...therapist("a"), tags: ["Online Therapy"] }]);
    await within(results()).findByText(/^1 of 1/);
    const inResults = within(screen.getByRole("tabpanel", { name: "Results" })).getByText("Online Therapy").outerHTML;
    const tab = screen.getByRole("tab", { name: /^Shortlist/ });
    fireEvent.mouseDown(tab);
    fireEvent.click(tab);
    expect(within(screen.getByRole("tabpanel", { name: /^Shortlist/ })).getByText("Online Therapy").outerHTML).toBe(inResults);
  });

  it("keeps its filters open to the right of the list on wide screens, offering only video and phone among the session types and no wheelchair access", async () => {
    screenIs(true);
    renderAt(GREEK);
    await loaded();
    expect(screen.queryByRole("button", { name: "Filters" })).toBeNull();
    expect(results().compareDocumentPosition(filters()) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    fireEvent.click(within(filters()).getByRole("button", { name: /^Type of Session/ }));
    expect(within(filters()).queryByRole("checkbox", { name: "Face to Face - Long Term" })).toBeNull();
    fireEvent.click(within(filters()).getByRole("button", { name: /^Additional Filters/ }));
    expect(within(filters()).queryByRole("checkbox", { name: "Only show wheelchair accessible" })).toBeNull();
    fireEvent.click(within(filters()).getByRole("checkbox", { name: "Telephone Therapy" }));
    expect(url().toString()).toBe("TypesOfSession=Telephone+Therapy&Languages=Greek");
    await waitFor(() => expect(asked()).toBe("TypesOfSession=Telephone+Therapy&Languages=Greek"));
    await loaded();
  });

  it("keeps the filters' heading still as they scroll on wide screens", async () => {
    screenIs(true);
    renderAt(ONLINE);
    const body = screen.getByRole("searchbox", { name: "Keyword search" }).closest(".overflow-y-auto");
    expect(body?.contains(within(filters()).getByRole("heading", { name: "Refine your search" }))).toBe(false);
  });

  it("opens its filters in a sheet from the right on narrow screens", async () => {
    screenIs(false);
    renderAt(ONLINE);
    fireEvent.click(screen.getByRole("button", { name: "Filters" }));
    expect((await screen.findByRole("dialog", { name: "Refine your search" })).dataset.side).toBe("right");
  });

  it.each([
    { screen: "wide", wide: true },
    { screen: "narrow", wide: false },
  ])("puts Load more at the list's end, scrolling with it, and only beside the results on $screen screens", async ({ wide }) => {
    screenIs(wide);
    shortlist.add(therapist("a"));
    renderAt(GREEK);
    await loaded();
    const more = screen.getByRole("button", { name: "Load more" });
    expect(list().contains(more)).toBe(true);
    const last = within(results()).getAllByRole("link", { name: /^Therapist p/ }).at(-1)!;
    expect(last.compareDocumentPosition(more) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    const tab = screen.getByRole("tab", { name: /^Shortlist/ });
    fireEvent.mouseDown(tab);
    fireEvent.click(tab);
    expect(screen.queryByRole("button", { name: "Load more" })).toBeNull();
  });

  it("returns to the same place in the list after Back from a profile", async () => {
    screenIs(true);
    renderAt(GREEK);
    await loaded();
    list().scrollTop = 400;
    fireEvent.scroll(list());
    fireEvent.click(screen.getByRole("link", { name: "Therapist p1-3" }));
    fireEvent.click(await screen.findByRole("button", { name: "Back" }));
    await loaded();
    expect(list().scrollTop).toBe(400);
  });

  it("keeps the shortlist in a tab beside the list, and beside the prompt before a search", async () => {
    screenIs(true);
    shortlist.add(therapist("a"));
    renderAt(ONLINE);
    expect(prompt()).toBeTruthy();
    expect(api.search).not.toHaveBeenCalled();
    const tab = screen.getByRole("tab", { name: /^Shortlist/ });
    fireEvent.mouseDown(tab);
    fireEvent.click(tab);
    expect(within(screen.getByRole("tabpanel", { name: /^Shortlist/ })).getByRole("link", { name: "Therapist a" })).toBeTruthy();
  });

  it("keeps the shortlist's scroll to itself beside the prompt", () => {
    screenIs(true);
    shortlist.add(therapist("a"));
    renderAt(ONLINE);
    const pick = (name: RegExp) => {
      const tab = screen.getByRole("tab", { name });
      fireEvent.mouseDown(tab);
      fireEvent.click(tab);
    };
    const scrollTo = (top: number) => {
      list().scrollTop = top;
      fireEvent.scroll(list());
    };
    scrollTo(100);
    pick(/^Shortlist/);
    scrollTo(400);
    pick(/^Results/);
    expect(list().scrollTop).toBe(100);
  });

  it("leaves where therapists are and how they meet off the cards, in the results and on the shortlist", async () => {
    screenIs(true);
    const a = { ...therapist("a", "London E8"), sessionTypes: "In-person & Remote" };
    shortlist.add(a);
    renderAt(GREEK, [a]);
    await within(results()).findByText(/^1 of 1/);
    const saysNeither = (panel: HTMLElement) => {
      expect(within(panel).getByRole("link", { name: "Therapist a" })).toBeTruthy();
      expect(within(panel).queryByText("London E8")).toBeNull();
      expect(within(panel).queryByText("In-person & Remote")).toBeNull();
    };
    saysNeither(screen.getByRole("tabpanel", { name: "Results" }));
    const tab = screen.getByRole("tab", { name: /^Shortlist/ });
    fireEvent.mouseDown(tab);
    fireEvent.click(tab);
    saysNeither(screen.getByRole("tabpanel", { name: /^Shortlist/ }));
  });
});
