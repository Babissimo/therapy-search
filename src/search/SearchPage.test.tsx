// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation, useNavigate } from "react-router";
import { afterEach, beforeEach, describe, expect, it, onTestFinished, vi } from "vitest";
import type { SearchResult, TherapistCard } from "@shared/types";
import { TooltipProvider } from "@/components/ui/tooltip";
import { api } from "@/lib/api";
import { listed } from "@/lib/listed.testing";
import { createSetAsideView, SetAsideContext, type SetAsideView } from "@/shortlist/setAside";
import { createShortlistStore, type ShortlistStore } from "@/shortlist/store";
import { ShortlistContext } from "@/shortlist/useShortlist";
import type { Highlight } from "./map/highlight";
import { layoutPins, type Pin } from "./map/pins";
import { prefetchSearchAt, warmMap } from "./prefetch";
import { NO_PLACE } from "./SearchBox";
import { SearchPage } from "./SearchPage";

// Results keep the order they are answered in here; order.test.ts and useResults.test.tsx cover the order itself.
vi.mock("./order", () => ({ orderSeed: () => 0, inOrder: <T,>(listings: T[]) => listings }));

// Counted, to see whether a hover makes the page lay its pins out again.
vi.mock("./map/pins", async (importOriginal) => {
  const pins = await importOriginal<typeof import("./map/pins")>();
  return { ...pins, layoutPins: vi.fn(pins.layoutPins) };
});

// The shortlist's chunk is here at once, so opening its tab shows it in the same step (see LazyShortlistTab.test.tsx).
vi.mock("@/shortlist/LazyShortlistTab", async () => ({
  LazyShortlistTab: (await import("@/shortlist/ShortlistTab")).ShortlistTab,
  usePreloadShortlistTab: () => {},
}));

// Counted, to see when the page starts fetching the map's code.
vi.mock("./prefetch", async (importOriginal) => {
  const prefetch = await importOriginal<typeof import("./prefetch")>();
  return { ...prefetch, warmMap: vi.fn(prefetch.warmMap) };
});

/** Set by a test whose map's code can't be fetched. */
const mapChunk = vi.hoisted(() => ({ fails: false }));

// The map pane is tested on its own; here it shows what the page passed it, with a button for each pin, one for a click on
// the map away from them, and one that finds BN3 1FG in the middle of the map where it offers a search there. Once its code
// can't be fetched, it throws where it would draw, as React does with a lazy component whose import failed.
vi.mock("./map/MapPane", async () => {
  const { createElement, useSyncExternalStore } = await import("react");
  type Props = {
    label: string;
    fitKey: string;
    centreSettled: boolean;
    pins: Pin[];
    marksShortlist?: boolean;
    showsStatuses?: boolean;
    highlight: Highlight;
    selected?: Pin;
    onSelect: (pin: Pin) => void;
    onDeselect: () => void;
    onSearchArea?: (postcode: string) => boolean;
    outsideUK?: boolean;
    coveredBelow?: (height: number) => number;
  };
  return {
    default: ({
      label,
      fitKey,
      centreSettled,
      pins,
      marksShortlist,
      showsStatuses,
      highlight,
      selected,
      onSelect,
      onDeselect,
      onSearchArea,
      outsideUK,
      coveredBelow,
    }: Props) => {
      if (mapChunk.fails) throw new TypeError("Failed to fetch dynamically imported module");
      const slug = useSyncExternalStore(highlight.subscribe, highlight.get);
      return createElement(
        "div",
        {
          role: "region",
          "aria-label": label,
          "data-testid": "map",
          "data-fit-key": fitKey,
          "data-settled": String(centreSettled),
          "data-marks-shortlist": String(Boolean(marksShortlist)),
          "data-shows-statuses": String(Boolean(showsStatuses)),
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
        createElement("button", { type: "button", onClick: onDeselect }, "Map away from the pins"),
        onSearchArea &&
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

/** Moves through the page's history by `delta` entries, as the browser's buttons and history menu do. */
let travel: (delta: number) => void;

function Travel() {
  const navigate = useNavigate();
  travel = (delta) => act(() => void navigate(delta));
  return null;
}

/**
 * The page's shortlist, empty at each test's start, and its "Set aside" section as a page load starts it. Each addition is newer
 * than the last, as a visitor's clicks are.
 */
let shortlist: ShortlistStore;
let setAside: SetAsideView;
beforeEach(() => {
  let now = 0;
  shortlist = createShortlistStore(null, () => ++now);
  setAside = createSetAsideView();
});

function renderAt(url: string, ...pages: TherapistCard[][]) {
  answer(pages);
  renderPage(url);
}

function renderPage(url: string, client = new QueryClient({ defaultOptions: { queries: { retry: false } } })) {
  const page = (
    <>
      <SearchPage />
      <Url />
      <Travel />
    </>
  );
  render(
    <QueryClientProvider client={client}>
      <ShortlistContext.Provider value={shortlist}>
        <SetAsideContext.Provider value={setAside}>
          <TooltipProvider>
            <MemoryRouter initialEntries={[url]}>
              <Routes>
                <Route path="/" element={page} />
                <Route path="/online" element={page} />
                <Route path="/therapist/:slug" element={<Profile />} />
              </Routes>
            </MemoryRouter>
          </TooltipProvider>
        </SetAsideContext.Provider>
      </ShortlistContext.Provider>
    </QueryClientProvider>,
  );
}

/** A search whose answer, with no "Location searched", has no centre to look up. */
const SEARCH = "/?Location=Leeds";
const url = () => new URLSearchParams(screen.getByTestId("url").textContent ?? "");
const path = () => screen.getByTestId("url").dataset.path;
const results = () => screen.getByRole("region", { name: "Results and shortlist" });
const loaded = () => within(results()).findByRole("heading", { name: "30 results" });
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

// Radix tabs switch on the mousedown that begins a click.
function pick(name: string | RegExp) {
  const tab = screen.getByRole("tab", { name });
  fireEvent.mouseDown(tab);
  fireEvent.click(tab);
}

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  mapChunk.fails = false;
});

describe("SearchPage", () => {
  it("sets the results beside the map on wide screens, and can put them away", async () => {
    screenIs(true);
    renderAt(SEARCH);
    await loaded();
    expect(await screen.findByTestId("map")).toBeTruthy();
    const toolbar = () => screen.getByRole("button", { name: "Filters" }).closest(".absolute")!;
    fireEvent.click(screen.getByRole("button", { name: "Hide list" }));
    expect(list().closest("[inert]")).not.toBeNull();
    // The toolbar stands aside for the toggle left over the map's top left.
    expect(toolbar().className).toContain("left-14");
    fireEvent.click(screen.getByRole("button", { name: "Show list" }));
    expect(list().closest("[inert]")).toBeNull();
    expect(toolbar().className).not.toContain("left-14");
  });

  it("keeps Load more over the map as an icon while the results are put away", async () => {
    screenIs(true);
    renderAt(SEARCH);
    await loaded();
    const more = screen.getByRole("button", { name: "Load more" });
    fireEvent.click(screen.getByRole("button", { name: "Hide list" }));
    // The same button, so it shrinks to its icon rather than being swapped for another.
    expect(screen.getByRole("button", { name: "Load more" })).toBe(more);
    expect(more.closest("[inert]")).toBeNull();
    expect(more.className).toContain("w-8");
    expect(more.querySelector("svg")?.classList.contains("lucide-list-plus")).toBe(true);
    fireEvent.click(more);
    expect(await within(results()).findByText(/^24 of 30/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Show list" }));
    expect(more.className).not.toContain("w-8");
  });

  it("names Load more in a tooltip only while it is folded to its icon", async () => {
    screenIs(true);
    renderAt(SEARCH);
    await loaded();
    const more = screen.getByRole("button", { name: "Load more" });
    act(() => more.focus());
    expect(screen.queryByRole("tooltip")).toBeNull();
    expect(more.getAttribute("aria-describedby")).toBeNull();
    act(() => more.blur());
    fireEvent.click(screen.getByRole("button", { name: "Hide list" }));
    act(() => more.focus());
    expect(screen.getByRole("tooltip").textContent).toBe("Load more");
  });

  it("says why a page failed while the results are put away, as their alert is hidden with them", async () => {
    screenIs(true);
    renderAt(SEARCH);
    await loaded();
    fireEvent.click(screen.getByRole("button", { name: "Hide list" }));
    vi.mocked(api.search).mockRejectedValueOnce(new Error("UKCP answered 503."));
    const more = screen.getByRole("button", { name: "Load more" });
    fireEvent.click(more);
    expect(await screen.findByRole("button", { name: "Try again" })).toBe(more);
    expect(more.querySelector("svg")?.classList.contains("lucide-rotate-cw")).toBe(true);
    expect(results().querySelector("[aria-live]")?.textContent).toBe("UKCP answered 503.");
    act(() => more.focus());
    expect(screen.getByRole("tooltip").textContent).toBe("UKCP answered 503.");
  });

  it("hands the keyboard to the side bar's toggle when the last page arrives while the results are put away", async () => {
    screenIs(true);
    renderAt(SEARCH, [therapist("a")], [therapist("b")]);
    await within(results()).findByText(/^1 of 2/);
    fireEvent.click(screen.getByRole("button", { name: "Hide list" }));
    const more = screen.getByRole("button", { name: "Load more" });
    act(() => more.focus());
    fireEvent.click(more);
    await within(results()).findByText(/^2 of 2/);
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole("button", { name: "Show list" })));
  });

  it("tells a screen reader what a search found with the list put away, and keeps saying so as the screen narrows", async () => {
    // Apart from the URL's <output>, which is a status too.
    const resultsStatus = () => screen.getAllByRole("status").find((el) => el.tagName === "P")!;
    const resize = screenIs(true);
    renderAt(SEARCH);
    await loaded();
    fireEvent.click(screen.getByRole("button", { name: "Hide list" }));
    const status = resultsStatus();
    await waitFor(() => expect(status.textContent).toBe("30 therapists near Leeds."));
    expect(status.closest("[inert]")).toBeNull();
    resize(false);
    expect(resultsStatus()).toBe(status);
    expect(status.closest("[inert]")).toBeNull();
  });

  it("asks for a search in place of the results, with no map, when there is nothing to search for", async () => {
    screenIs(true);
    renderAt("/");
    await mapLoads();
    expect(within(results()).getByText(/^Tick anything that matters to you/)).toBeTruthy();
    expect(screen.getByRole("tab", { name: "Results" }).getAttribute("aria-selected")).toBe("true");
    expect(screen.getByRole("heading", { level: 1, name: "Find a UKCP therapist" })).toBeTruthy();
    expect(screen.queryByTestId("map")).toBeNull();
    expect(api.search).not.toHaveBeenCalled();
    fireEvent.change(screen.getByRole("textbox", { name: "Location" }), { target: { value: "York" } });
    fireEvent.click(screen.getByRole("button", { name: "Search" }));
    fireEvent.click(screen.getByRole("button", { name: "Search without filters" }));
    await loaded();
    expect(await screen.findByTestId("map")).toBeTruthy();
    expect(screen.queryByText(/^Tick anything that matters to you/)).toBeNull();
  });

  it("says where to turn for help today beneath the prompt, near a place or online", () => {
    screenIs(true);
    renderAt("/");
    expect(within(results()).getByText(/^Need help now\?/).querySelector("a[href='tel:116123']")).toBeTruthy();
    cleanup();
    renderAt("/online");
    expect(within(results()).getByText(/^Need help now\?/).querySelector("a[href='tel:116123']")).toBeTruthy();
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
    expect(screen.getByText(/^Tick anything that matters to you/)).toBeTruthy();
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
    renderAt("/?Location=Leeds&Languages=French");
    await loaded();
    expect(await screen.findByTestId("map")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Show map" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Location" }), { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: /^Filters/ }));
    fireEvent.click(await screen.findByRole("button", { name: "Clear all filters" }));
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(within(results()).getByText(/^Tick anything that matters to you/)).toBeTruthy();
    expect(screen.queryByTestId("map")).toBeNull();
    fireEvent.change(screen.getByRole("textbox", { name: "Location" }), { target: { value: "York" } });
    fireEvent.click(screen.getByRole("button", { name: "Search" }));
    fireEvent.click(screen.getByRole("button", { name: "Search without filters" }));
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

  it.each([
    ["wide", true],
    ["narrow", false],
  ])("keeps the results and their searches going on %s screens, with a note in the map's place, when its code can't be fetched", async (_, wide) => {
    // React reports the error it caught to the console.
    vi.spyOn(console, "error").mockImplementation(() => {});
    mapChunk.fails = true;
    screenIs(wide);
    renderAt(SEARCH);
    await loaded();
    expect(await screen.findByText("The map couldn't load.")).toBeTruthy();
    expect(screen.queryByTestId("map")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Load more" }));
    expect(await within(results()).findByText(/^24 of 30/)).toBeTruthy();
    fireEvent.change(screen.getByRole("textbox", { name: "Location" }), { target: { value: "York" } });
    fireEvent.click(screen.getByRole("button", { name: "Search" }));
    expect(url().get("Location")).toBe("York");
    expect(await within(results()).findByText(/^12 of 30/)).toBeTruthy();
    expect(vi.mocked(api.search).mock.lastCall?.[0]).toBe("Location=York");
    expect(screen.getByText("The map couldn't load.")).toBeTruthy();
  });

  it("keeps Load more beneath the list rather than at its end", async () => {
    screenIs(true);
    renderAt(SEARCH);
    await loaded();
    const more = screen.getByRole("button", { name: "Load more" });
    expect(results().contains(more)).toBe(true);
    expect(list().contains(more)).toBe(false);
  });

  it("names the searched place under the list's heading", async () => {
    screenIs(true);
    vi.spyOn(api, "place").mockResolvedValue({ found: true, kind: "place", candidates: [{ lat: 53.8, lng: -1.55 }] });
    const therapists = [{ ...therapist("a"), distance: "0.4 miles from Leeds" }];
    vi.spyOn(api, "search").mockResolvedValue(listed({ total: 1, from: 1, to: 1, notices: [], therapists, locationSearched: "Leeds, UK" }));
    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <TooltipProvider>
          <MemoryRouter initialEntries={[SEARCH]}>
            <SearchPage />
          </MemoryRouter>
        </TooltipProvider>
      </QueryClientProvider>,
    );
    const heading = await screen.findByRole("heading", { name: "1 result within 0.4 miles" });
    expect(heading.nextElementSibling?.textContent).toBe("Leeds, UK");
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

  it("hands the keyboard back to the Filters button as they close, by their button or by Escape", async () => {
    screenIs(true);
    renderAt(SEARCH);
    await loaded();
    const open = screen.getByRole("button", { name: "Filters" });
    const filters = () => screen.queryByRole("region", { name: "Refine your search" });
    fireEvent.click(open);
    const close = screen.getByRole("button", { name: "Close filters" });
    act(() => close.focus());
    fireEvent.click(close);
    expect(filters()).toBeNull();
    expect(document.activeElement).toBe(open);
    fireEvent.click(open);
    const inside = within(filters()!).getAllByRole("button")[1]!;
    act(() => inside.focus());
    fireEvent.keyDown(inside, { key: "Escape" });
    expect(filters()).toBeNull();
    expect(document.activeElement).toBe(open);
    // From the place box, which keeps the keyboard, as the filters never had it.
    fireEvent.click(open);
    const place = screen.getByRole("textbox", { name: "Location" });
    act(() => place.focus());
    fireEvent.keyDown(place, { key: "Escape" });
    expect(filters()).toBeNull();
    expect(document.activeElement).toBe(place);
  });

  it("leaves the filters open when Escape empties a search box within them, and closes them where it doesn't", async () => {
    screenIs(true);
    renderAt(SEARCH);
    await loaded();
    fireEvent.click(screen.getByRole("button", { name: "Filters" }));
    const filters = () => screen.queryByRole("region", { name: "Refine your search" });
    fireEvent.click(within(filters()!).getByRole("button", { name: "Languages" }));
    const search = within(filters()!).getByRole("searchbox", { name: /^Search languages$/i });
    fireEvent.change(search, { target: { value: "pol" } });
    // As Chrome and Safari answer it.
    fireEvent.keyDown(search, { key: "Escape" });
    fireEvent.change(search, { target: { value: "" } });
    await act(() => new Promise((resolve) => setTimeout(resolve)));
    expect(filters()).not.toBeNull();
    // As a browser that leaves the box filled does.
    fireEvent.change(search, { target: { value: "pol" } });
    fireEvent.keyDown(search, { key: "Escape" });
    await waitFor(() => expect(filters()).toBeNull());
  });

  it("skips the keyboard past the list to the search box, and to the list when it is put away", async () => {
    screenIs(true);
    renderAt(SEARCH);
    await loaded();
    await screen.findByTestId("map");
    fireEvent.click(screen.getByRole("link", { name: "Skip to the search box" }));
    expect(document.activeElement).toBe(screen.getByRole("textbox", { name: "Location" }));
    fireEvent.click(screen.getByRole("button", { name: "Hide list" }));
    expect(list().closest("[inert]")).not.toBeNull();
    fireEvent.click(screen.getByRole("link", { name: "Skip to the results" }));
    expect(list().closest("[inert]")).toBeNull();
    await waitFor(() => expect(document.activeElement).toBe(within(results()).getByRole("tabpanel", { name: /^Results/ })));
  });

  it("brings the results' tab forward as it skips to them from the shortlist's", async () => {
    screenIs(true);
    renderAt(SEARCH);
    await loaded();
    fireEvent.mouseDown(screen.getByRole("tab", { name: /^Shortlist/ }));
    expect(within(results()).getByRole("tabpanel", { name: /^Shortlist/ })).toBeTruthy();
    fireEvent.click(screen.getByRole("link", { name: "Skip to the results" }));
    await waitFor(() => expect(document.activeElement).toBe(within(results()).getByRole("tabpanel", { name: /^Results/ })));
  });

  it("brings the search box back from beside the shortlist as it skips to it", async () => {
    screenIs(true);
    renderAt(SEARCH);
    await loaded();
    fireEvent.mouseDown(screen.getByRole("tab", { name: /^Shortlist/ }));
    expect(screen.queryByRole("textbox", { name: "Location" })).toBeNull();
    fireEvent.click(screen.getByRole("link", { name: "Skip to the search box" }));
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole("textbox", { name: "Location" })));
    expect(within(results()).getByRole("tabpanel", { name: /^Results/ })).toBeTruthy();
  });

  it("skips past the prompt to the filters right of it on wide screens, bringing them back from beside the shortlist", async () => {
    screenIs(true);
    renderAt("/");
    const filters = () => screen.getByRole("region", { name: "Refine your search" });
    const first = () => within(filters()).getByRole("button", { name: /^Type of session/i });
    const skip = screen.getByRole("link", { name: "Skip to the filters" });
    fireEvent.click(skip);
    expect(document.activeElement).toBe(first());
    fireEvent.mouseDown(screen.getByRole("tab", { name: /^Shortlist/ }));
    expect(screen.queryByRole("region", { name: "Refine your search" })).toBeNull();
    fireEvent.click(skip);
    await waitFor(() => expect(document.activeElement).toBe(first()));
    expect(within(results()).getByRole("tabpanel", { name: /^Results/ })).toBeTruthy();
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
    expect(screen.getByText(/^Tick anything that matters to you/)).toBeTruthy();
    expect(filters()).toBeTruthy();
    const box = screen.getByRole("textbox", { name: "Location" });
    box.focus();
    fireEvent.change(box, { target: { value: "York" } });
    fireEvent.submit(box.closest("form")!);
    expect(filters()).toBeNull();
    // The box moves from beneath the filters to the toolbar over the map, handing the keyboard to the search's list.
    expect(document.activeElement).toBe(screen.getByRole("tab", { name: "Results" }));
    await loaded();
    expect(api.search).toHaveBeenCalledOnce();
  });

  it("sets the place box beneath the filters right of the prompt on wide screens, with the switch alone above them", async () => {
    screenIs(true);
    renderAt("/");
    const filters = screen.getByRole("region", { name: "Refine your search" });
    const box = within(filters).getByRole("textbox", { name: "Location" });
    expect(within(filters).getByRole("button", { name: /^Languages/ }).compareDocumentPosition(box) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(within(filters).getByText("Where are you?")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Near me" }).compareDocumentPosition(filters) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByText("Start with what matters to you.")).toBeTruthy();
  });

  it.each([
    ["wide", true],
    ["narrow", false],
  ])("opens the languages from beneath the prompt on %s screens, taking the keyboard to their search box, and holds ticks made there", (_, wide) => {
    screenIs(wide);
    renderAt("/");
    const shortcut = () => within(results()).getByRole("button", { name: "Find a therapist who speaks your language" });
    const languages = () => screen.getByRole("button", { name: /^Languages/ });
    expect(languages().getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(shortcut());
    expect(languages().getAttribute("aria-expanded")).toBe("true");
    expect(document.activeElement).toBe(screen.getByRole("searchbox", { name: "Search languages" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "French" }));
    expect(url().toString()).toBe("");
    // Already open, the group stays so.
    fireEvent.click(shortcut());
    expect(languages().getAttribute("aria-expanded")).toBe("true");
    expect(document.activeElement).toBe(screen.getByRole("searchbox", { name: "Search languages" }));
    expect(api.search).not.toHaveBeenCalled();
  });

  it("opens the languages from beneath the online prompt, and from beneath the ask for a filter first", () => {
    screenIs(true);
    renderAt("/online");
    fireEvent.click(within(results()).getByRole("button", { name: "Find a therapist who speaks your language" }));
    expect(document.activeElement).toBe(screen.getByRole("searchbox", { name: "Search languages" }));
    cleanup();
    renderAt("/");
    fireEvent.change(screen.getByRole("textbox", { name: "Location" }), { target: { value: "York" } });
    fireEvent.click(screen.getByRole("button", { name: "Search" }));
    within(results()).getByText(/^Before we search near/);
    fireEvent.click(within(results()).getByRole("button", { name: "Find a therapist who speaks your language" }));
    expect(document.activeElement).toBe(screen.getByRole("searchbox", { name: "Search languages" }));
  });

  it("asks for a filter first when a place is searched from the start with nothing ticked, and searches once one is", async () => {
    screenIs(true);
    renderAt("/");
    fireEvent.change(screen.getByRole("textbox", { name: "Location" }), { target: { value: "York" } });
    fireEvent.click(screen.getByRole("button", { name: "Search" }));
    expect(url().toString()).toBe("");
    expect(api.search).not.toHaveBeenCalled();
    const ask = within(results()).getByText(/^Before we search near/);
    expect(ask.textContent).toBe("Before we search near York");
    expect(within(ask).getByText("York").getAttribute("translate")).toBe("no");
    expect(document.activeElement?.contains(ask)).toBe(true);
    // What is read out as it takes focus, without the help beneath, which stays quiet.
    expect(document.activeElement?.textContent).not.toContain("Need help now?");
    expect(screen.queryByText(/^Tick anything that matters to you/)).toBeNull();
    const filters = screen.getByRole("region", { name: "Refine your search" });
    fireEvent.click(within(filters).getByRole("button", { name: /^Languages/ }));
    expect(screen.getByRole("button", { name: "Search without filters" })).toBeTruthy();
    fireEvent.click(within(filters).getByRole("checkbox", { name: "French" }));
    expect(screen.queryByRole("button", { name: "Search without filters" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Search" }));
    expect(url().toString()).toBe("Location=York&Languages=French");
    await loaded();
    expect(api.search).toHaveBeenCalledOnce();
  });

  it("searches the place in the box without filters, though another was asked about", async () => {
    screenIs(true);
    renderAt("/");
    fireEvent.change(screen.getByRole("textbox", { name: "Location" }), { target: { value: "York" } });
    fireEvent.click(screen.getByRole("button", { name: "Search" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Location" }), { target: { value: "Leeds" } });
    fireEvent.click(screen.getByRole("button", { name: "Search without filters" }));
    expect(url().toString()).toBe("Location=Leeds");
    await loaded();
  });

  it("counts a keyword as a filter, searching a place from the start with no prompt", async () => {
    screenIs(true);
    renderAt("/");
    fireEvent.change(screen.getByRole("searchbox", { name: "Keyword search" }), { target: { value: "grief" } });
    fireEvent.change(screen.getByRole("textbox", { name: "Location" }), { target: { value: "York" } });
    fireEvent.click(screen.getByRole("button", { name: "Search" }));
    expect(url().toString()).toBe("Location=York&KeywordFilter=grief");
    await loaded();
  });

  it("searches a place without filters when asked to, and asks no more while Near me stays open", async () => {
    screenIs(true);
    renderAt("/");
    const box = () => screen.getByRole("textbox", { name: "Location" });
    fireEvent.change(box(), { target: { value: "York" } });
    fireEvent.click(screen.getByRole("button", { name: "Search" }));
    fireEvent.click(screen.getByRole("button", { name: "Search without filters" }));
    expect(url().toString()).toBe("Location=York");
    await loaded();
    // Back to the start, by clearing a search with a filter in it.
    fireEvent.click(screen.getByRole("button", { name: "Filters" }));
    fireEvent.click(screen.getByRole("button", { name: /^Languages/ }));
    fireEvent.click(screen.getByRole("checkbox", { name: "French" }));
    fireEvent.click(screen.getByRole("button", { name: "Update results" }));
    fireEvent.change(box(), { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: "Clear all filters" }));
    fireEvent.click(screen.getByRole("button", { name: "Close filters" }));
    expect(screen.getByText(/^Tick anything that matters to you/)).toBeTruthy();
    fireEvent.change(box(), { target: { value: "Leeds" } });
    fireEvent.click(screen.getByRole("button", { name: "Search" }));
    expect(url().toString()).toBe("Location=Leeds");
    await loaded();
  });

  it("asks for a filter first when Use my location finds the place from the start with nothing ticked", async () => {
    screenIs(true);
    const getCurrentPosition = (ok: PositionCallback) => ok({ coords: { latitude: 50.82614, longitude: -0.15987 } } as GeolocationPosition);
    Object.defineProperty(navigator, "geolocation", { value: { getCurrentPosition }, configurable: true });
    onTestFinished(() => void Reflect.deleteProperty(navigator, "geolocation"));
    vi.spyOn(api, "nearest").mockResolvedValue({ found: true, postcode: "BN3 1FG" });
    renderAt("/");
    fireEvent.click(screen.getByRole("button", { name: "Use my location" }));
    expect((await within(results()).findByText(/^Before we search near/)).textContent).toBe("Before we search near BN3 1FG");
    expect(screen.getByRole<HTMLInputElement>("textbox", { name: "Location" }).value).toBe("BN3 1FG");
    expect(url().toString()).toBe("");
    expect(api.search).not.toHaveBeenCalled();
  });

  it("holds ticks made beside the prompt until a place is searched, then asks UKCP once for them all", async () => {
    screenIs(true);
    renderAt("/");
    const filters = () => screen.getByRole("region", { name: "Refine your search" });
    fireEvent.change(screen.getByRole("textbox", { name: "Location" }), { target: { value: "York" } });
    fireEvent.click(within(filters()).getByRole("button", { name: /^Languages/ }));
    fireEvent.click(within(filters()).getByRole("checkbox", { name: "French" }));
    fireEvent.click(within(filters()).getByRole("checkbox", { name: "German" }));
    expect(url().toString()).toBe("");
    fireEvent.click(screen.getByRole("button", { name: "Search" }));
    expect(url().toString()).toBe("Location=York&Languages=French&Languages=German");
    await loaded();
    expect(api.search).toHaveBeenCalledOnce();
  });

  it("holds ticks over the map until Update results, which searches them once and keeps the filters and the keyboard where they were", async () => {
    screenIs(true);
    renderAt(SEARCH);
    await loaded();
    fireEvent.click(screen.getByRole("button", { name: "Filters" }));
    const filters = () => screen.getByRole("region", { name: "Refine your search" });
    const update = within(filters()).getByRole("button", { name: "Update results" });
    expect(update.getAttribute("aria-disabled")).toBe("true");
    fireEvent.click(within(filters()).getByRole("button", { name: /^Languages/ }));
    fireEvent.click(within(filters()).getByRole("checkbox", { name: "French" }));
    fireEvent.click(within(filters()).getByRole("checkbox", { name: "German" }));
    expect(url().toString()).toBe("Location=Leeds");
    expect(update.getAttribute("aria-disabled")).toBeNull();
    update.focus();
    fireEvent.click(update);
    expect(url().toString()).toBe("Location=Leeds&Languages=French&Languages=German");
    expect(filters()).toBeTruthy();
    expect(document.activeElement).toBe(update);
    expect(update.getAttribute("aria-disabled")).toBe("true");
    await waitFor(() => expect(api.search).toHaveBeenCalledTimes(2));
  });

  it("searches ticks waiting over the map as the filters are put away", async () => {
    screenIs(true);
    renderAt(SEARCH);
    await loaded();
    fireEvent.click(screen.getByRole("button", { name: "Filters" }));
    fireEvent.click(screen.getByRole("button", { name: /^Languages/ }));
    fireEvent.click(screen.getByRole("checkbox", { name: "French" }));
    fireEvent.click(screen.getByRole("button", { name: "Close filters" }));
    expect(url().toString()).toBe("Location=Leeds&Languages=French");
    expect(screen.queryByRole("region", { name: "Refine your search" })).toBeNull();
    await waitFor(() => expect(api.search).toHaveBeenCalledTimes(2));
  });

  it("searches nothing as the filters over the map are put away with nothing new in them, whatever is typed in the place box", async () => {
    screenIs(true);
    renderAt(SEARCH);
    await loaded();
    fireEvent.change(screen.getByRole("textbox", { name: "Location" }), { target: { value: "Brist" } });
    fireEvent.click(screen.getByRole("button", { name: "Filters" }));
    fireEvent.click(screen.getByRole("button", { name: /^Languages/ }));
    fireEvent.click(screen.getByRole("checkbox", { name: "French" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "French" }));
    fireEvent.click(screen.getByRole("button", { name: "Close filters" }));
    expect(url().toString()).toBe("Location=Leeds");
    expect(api.search).toHaveBeenCalledOnce();
  });

  it("searches without a chip's filter at once, taking ticks still waiting with it", async () => {
    screenIs(true);
    renderAt("/?Location=Leeds&Languages=Greek");
    await loaded();
    fireEvent.click(screen.getByRole("button", { name: "Filters, 1 ticked" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "French" }));
    fireEvent.click(screen.getByRole("button", { name: "Remove Greek" }));
    expect(url().toString()).toBe("Location=Leeds&Languages=French");
    await waitFor(() => expect(api.search).toHaveBeenCalledTimes(2));
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

  it("sets the switch above the list's tabs on a phone before a search, and the filters then the place box beneath the prompt, handing the keyboard to the search's list as it begins", async () => {
    screenIs(false);
    shortlist.add(therapist("a"));
    renderAt("/");
    await mapLoads();
    expect(within(results()).getByText(/^Tick anything that matters to you/)).toBeTruthy();
    expect(screen.queryByTestId("map")).toBeNull();
    expect(screen.queryByRole("button", { name: "Filters" })).toBeNull();
    const tablist = screen.getByRole("tablist");
    expect(screen.getByRole("link", { name: "Near me" }).compareDocumentPosition(tablist) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    const panel = screen.getByRole("tabpanel", { name: "Results" });
    const box = within(panel).getByRole("textbox", { name: "Location" });
    expect(within(panel).getByRole("button", { name: /^Languages/ }).compareDocumentPosition(box) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getAllByRole("heading", { level: 1, name: "Find a UKCP therapist" })).toHaveLength(1);
    pick(/^Shortlist/);
    expect(within(screen.getByRole("tabpanel", { name: /^Shortlist/ })).getByRole("link", { name: "Therapist a" })).toBeTruthy();
    // The switch above the tabs belongs to the search, which the shortlist has no use for.
    expect(screen.queryByRole("link", { name: "Near me" })).toBeNull();
    pick("Results");
    fireEvent.click(within(panel).getByRole("button", { name: /^Languages/ }));
    fireEvent.click(within(panel).getByRole("checkbox", { name: "French" }));
    expect(panel.querySelectorAll("[data-unsearched]")).toHaveLength(1);
    box.focus();
    fireEvent.change(box, { target: { value: "York" } });
    fireEvent.submit(box.closest("form")!);
    expect(url().toString()).toBe("Location=York&Languages=French");
    const tab = screen.getByRole("tab", { name: "Results" });
    expect(tab.getAttribute("aria-selected")).toBe("true");
    expect(document.activeElement).toBe(tab);
    expect(results().dataset.position).toBe("full");
    await loaded();
  });

  it("holds a phone's ticks until the filters sheet is put away, by Show results or otherwise", async () => {
    screenIs(false);
    renderAt(SEARCH);
    await loaded();
    const open = async () => {
      fireEvent.click(screen.getByRole("button", { name: /^Filters/ }));
      return screen.findByRole("dialog", { name: "Refine your search" });
    };
    let sheet = await open();
    fireEvent.click(within(sheet).getByRole("button", { name: /^Languages/ }));
    fireEvent.click(within(sheet).getByRole("checkbox", { name: "French" }));
    expect(url().toString()).toBe("Location=Leeds");
    expect(api.search).toHaveBeenCalledOnce();
    fireEvent.click(within(sheet).getByRole("button", { name: "Show results" }));
    expect(url().toString()).toBe("Location=Leeds&Languages=French");
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    sheet = await open();
    fireEvent.click(within(sheet).getByRole("checkbox", { name: "French" }));
    fireEvent.keyDown(sheet, { key: "Escape" });
    expect(url().toString()).toBe("Location=Leeds");
  });

  it("keeps ticks waiting in a phone's sheet as the screen widens, for the filters over the map to search", async () => {
    const resize = screenIs(false);
    renderAt(SEARCH);
    await loaded();
    fireEvent.click(screen.getByRole("button", { name: "Filters" }));
    const sheet = await screen.findByRole("dialog", { name: "Refine your search" });
    fireEvent.click(within(sheet).getByRole("button", { name: /^Languages/ }));
    fireEvent.click(within(sheet).getByRole("checkbox", { name: "French" }));
    // Widened, the sheet goes, and the filters stay shut over the map, as they were never open there.
    resize(true);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.queryByRole("region", { name: "Refine your search" })).toBeNull();
    expect(url().toString()).toBe("Location=Leeds");
    fireEvent.click(screen.getByRole("button", { name: "Filters, 1 ticked" }));
    fireEvent.click(screen.getByRole("button", { name: "Update results" }));
    expect(url().toString()).toBe("Location=Leeds&Languages=French");
  });

  it("tells a screen reader what the first search found, from a live region in place before it", async () => {
    screenIs(false);
    renderAt("/");
    const status = screen.getAllByRole("status").find((el) => el.tagName === "P");
    expect(status?.textContent).toBe("");
    fireEvent.change(screen.getByRole("searchbox", { name: "Keyword search" }), { target: { value: "grief" } });
    fireEvent.change(screen.getByRole("textbox", { name: "Location" }), { target: { value: "York" } });
    fireEvent.click(screen.getByRole("button", { name: "Search" }));
    await waitFor(() => expect(status?.textContent).toBe("30 therapists near York."));
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
    expect(await within(results()).findByText("Pins show the postcode or area each therapist lists · 2 not on the map.")).toBeTruthy();
    expect(within(results()).getByText("3 of 3")).toBeTruthy();
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

  it("marks a selected pin's place in the list until the pin is activated again or the map clicked off it, raising the sheet halfway", async () => {
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
    const alone = screen.getByRole("link", { name: "Therapist b" }).closest("li");
    expect(alone?.getAttribute("aria-current")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: "Map away from the pins" }));
    expect(alone?.hasAttribute("aria-current")).toBe(false);
    expect(screen.getByTestId("map").dataset.selected).toBe("");
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

  it("redraws only the box typed in, not the page with its pins", async () => {
    screenIs(true);
    renderAt(SEARCH);
    await screen.findByRole("link", { name: "Therapist p1-2" });
    await screen.findByTestId("map");
    const laidOut = () => vi.mocked(layoutPins).mock.calls.length;
    const before = laidOut();
    fireEvent.change(screen.getByRole("textbox", { name: "Location" }), { target: { value: "Leeds" } });
    expect(screen.getByRole<HTMLInputElement>("textbox", { name: "Location" }).value).toBe("Leeds");
    expect(laidOut()).toBe(before);
    fireEvent.click(screen.getByRole("button", { name: /^Filters/ }));
    const keyword = await screen.findByRole<HTMLInputElement>("searchbox", { name: "Keyword search" });
    const opened = laidOut();
    fireEvent.change(keyword, { target: { value: "grief" } });
    expect(keyword.value).toBe("grief");
    expect(laidOut()).toBe(opened);
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

  it.each([
    { screen: "wide", wide: true },
    { screen: "narrow", wide: false },
  ])("returns to the shortlist at its own place after Back from a profile opened from it on $screen screens", async ({ wide }) => {
    screenIs(wide);
    shortlist.add(therapist("a"));
    renderAt(SEARCH);
    await loaded();
    pick(/^Shortlist/);
    list().scrollTop = 400;
    fireEvent.scroll(list());
    fireEvent.click(screen.getByRole("link", { name: "Therapist a" }));
    fireEvent.click(await screen.findByRole("button", { name: "Back" }));
    expect(await screen.findByRole("tab", { name: /^Shortlist/, selected: true })).toBeTruthy();
    expect(list().scrollTop).toBe(400);
  });

  it("opens each search near a place on its own tab as the browser jumps between them, leaving a pin selected on the other list", async () => {
    screenIs(true);
    placeByDistrict();
    shortlist.add(therapist("c", "Hove BN3"));
    renderAt(SEARCH, [therapist("a", "Hove BN3")]);
    await within(results()).findByRole("link", { name: "Therapist a" });
    fireEvent.click(screen.getByRole("link", { name: "Online" }));
    fireEvent.click(screen.getByRole("link", { name: "Near me" }));
    await within(results()).findByRole("link", { name: "Therapist a" });
    await within(map()).findByRole("button", { name: `Pin ${key(HOVE)}` });
    pick(/^Shortlist/);
    fireEvent.click(await within(map()).findByRole("button", { name: `Pin ${key(HOVE)}` }));
    expect(map().dataset.selected).toBe(key(HOVE));
    // As from the browser's history menu: past Online to the first search, then on to the second, the view staying mounted.
    travel(-2);
    expect(screen.getByRole("tab", { name: "Results", selected: true })).toBeTruthy();
    // The results have a pin there too, which is not the one selected.
    expect(within(map()).getByRole("button", { name: `Pin ${key(HOVE)}` })).toBeTruthy();
    expect(map().dataset.selected).toBe("");
    travel(2);
    expect(screen.getByRole("tab", { name: /^Shortlist/, selected: true })).toBeTruthy();
  });

  it("puts the search away while the shortlist is open, bringing it back as it was left", async () => {
    screenIs(true);
    renderAt("/?Location=Leeds&Languages=French");
    await loaded();
    await screen.findByTestId("map");
    fireEvent.click(screen.getByRole("button", { name: "Filters, 1 ticked" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Location" }), { target: { value: "York" } });
    pick(/^Shortlist/);
    expect(screen.queryByRole("link", { name: "Near me" })).toBeNull();
    expect(screen.queryByRole("textbox", { name: "Location" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Remove French" })).toBeNull();
    expect(screen.queryByRole("region", { name: "Refine your search" })).toBeNull();
    expect(within(map()).queryByRole("button", { name: "Search this area" })).toBeNull();
    pick("Results");
    expect(screen.getByRole<HTMLInputElement>("textbox", { name: "Location" }).value).toBe("York");
    expect(screen.getByRole("button", { name: "Remove French" })).toBeTruthy();
    expect(screen.getByRole("region", { name: "Refine your search" })).toBeTruthy();
    expect(within(map()).getByRole("button", { name: "Search this area" })).toBeTruthy();
  });

  it("puts the search over the map away on a phone while the shortlist is open", async () => {
    screenIs(false);
    renderAt("/?Location=Leeds&Languages=French");
    await loaded();
    await screen.findByTestId("map");
    pick(/^Shortlist/);
    expect(screen.queryByRole("textbox", { name: "Location" })).toBeNull();
    expect(screen.queryByRole("button", { name: /^Filters/ })).toBeNull();
    expect(screen.queryByRole("button", { name: "Remove French" })).toBeNull();
    expect(within(map()).queryByRole("button", { name: "Search this area" })).toBeNull();
    pick("Results");
    expect(screen.getByRole("textbox", { name: "Location" })).toBeTruthy();
    expect(within(map()).getByRole("button", { name: "Search this area" })).toBeTruthy();
  });

  it("gives the shortlist the page before a search on wide screens, the filters beside the prompt standing aside", () => {
    screenIs(true);
    shortlist.add(therapist("a"));
    renderAt("/");
    pick(/^Shortlist/);
    expect(screen.queryByRole("region", { name: "Refine your search" })).toBeNull();
    // Their column goes with them, rather than standing empty beside the list.
    const box = screen.getByRole("textbox", { name: "Location", hidden: true });
    const asides = [...document.querySelectorAll("[hidden]")].filter((hidden) => hidden.contains(box));
    expect(asides.some((aside) => aside.parentElement?.contains(results()))).toBe(true);
    pick("Results");
    expect(screen.getByRole("region", { name: "Refine your search" })).toBeTruthy();
  });

  it("maps the shortlist alone while its tab is open, framed apart from the results", async () => {
    screenIs(true);
    placeByDistrict();
    shortlist.add(therapist("c", "Hove BN3"));
    renderAt(SEARCH, [therapist("a", "BRIGHTON BN1"), therapist("b", "Hove BN3")]);
    await waitFor(() => expect(mapPins()).toEqual([`Pin ${key(BRIGHTON)}: a`, `Pin ${key(HOVE)}: b`]));
    const framed = map().dataset.fitKey;
    expect(screen.getByRole("region", { name: "Map of results" })).toBe(map());
    // Among the results, shortlisted therapists' pins are picked out; on the shortlist's own map, every pin would be, so
    // it shows where the visitor stands with each instead.
    expect(map().dataset.marksShortlist).toBe("true");
    expect(map().dataset.showsStatuses).toBe("false");
    pick(/^Shortlist/);
    await waitFor(() => expect(mapPins()).toEqual([`Pin ${key(HOVE)}: c`]));
    expect(map().dataset.fitKey).not.toBe(framed);
    expect(screen.getByRole("region", { name: "Map of your shortlist" })).toBe(map());
    expect(map().dataset.marksShortlist).toBe("false");
    expect(map().dataset.showsStatuses).toBe("true");
    pick("Results");
    expect(mapPins()).toEqual([`Pin ${key(BRIGHTON)}: a`, `Pin ${key(HOVE)}: b`]);
    expect(map().dataset.fitKey).toBe(framed);
    expect(map().dataset.marksShortlist).toBe("true");
    expect(map().dataset.showsStatuses).toBe("false");
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

  it("maps those set aside only while their section is open, keeping it open as the tabs change", async () => {
    screenIs(true);
    placeByDistrict();
    shortlist.add(therapist("c", "Hove BN3"));
    shortlist.add(therapist("d", "BRIGHTON BN1"));
    shortlist.setStatus("d", "setAside");
    renderAt(SEARCH, [therapist("a", "BRIGHTON BN1")]);
    await within(results()).findByRole("link", { name: "Therapist a" });
    pick(/^Shortlist/);
    await waitFor(() => expect(mapPins()).toEqual([`Pin ${key(HOVE)}: c`]));
    fireEvent.click(screen.getByRole("button", { name: "Set aside, 1 therapist", expanded: false }));
    await waitFor(() => expect(mapPins()).toEqual([`Pin ${key(BRIGHTON)}: d`, `Pin ${key(HOVE)}: c`]));
    pick("Results");
    pick(/^Shortlist/);
    screen.getByRole("button", { name: "Set aside, 1 therapist", expanded: true });
    await waitFor(() => expect(mapPins()).toEqual([`Pin ${key(BRIGHTON)}: d`, `Pin ${key(HOVE)}: c`]));
    fireEvent.click(screen.getByRole("button", { name: "Set aside, 1 therapist", expanded: true }));
    await waitFor(() => expect(mapPins()).toEqual([`Pin ${key(HOVE)}: c`]));
  });

  it("counts everyone on the shortlist but those set aside", async () => {
    screenIs(true);
    shortlist.add(therapist("c"));
    shortlist.add(therapist("d"));
    shortlist.setStatus("d", "setAside");
    renderAt(SEARCH);
    await loaded();
    screen.getByRole("tab", { name: "Shortlist, 1 therapist" });
  });

  it("counts those set aside among those not on the map only while their section is open", async () => {
    screenIs(true);
    placeByDistrict();
    shortlist.add(therapist("c", "Hove BN3"));
    shortlist.add(therapist("d", " BN"));
    shortlist.setStatus("d", "setAside");
    renderAt(SEARCH);
    await loaded();
    pick(/^Shortlist/);
    await waitFor(() => expect(mapPins()).toEqual([`Pin ${key(HOVE)}: c`]));
    screen.getByText("Kept in this browser only.");
    fireEvent.click(screen.getByRole("button", { name: "Set aside, 1 therapist" }));
    expect(await screen.findByText("Kept in this browser only · 1 not on the map.")).toBeTruthy();
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
    expect(await within(results()).findByText(/each therapist lists · 1 not on the map\.$/)).toBeTruthy();
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
  const prompt = () => screen.queryByText("Start with what matters to you.");

  it("lists everyone working online or by phone who matches its filters, with no place to search and no map", async () => {
    screenIs(true);
    renderAt(GREEK);
    const heading = await loaded();
    await mapLoads();
    expect(screen.queryByTestId("map")).toBeNull();
    expect(screen.queryByRole("textbox", { name: "Location" })).toBeNull();
    expect(asked()).toBe(GREEK_ONLINE);
    // The count stands alone, with no share of it loaded, order or pins to speak of.
    expect(heading.nextElementSibling).toBeNull();
  });

  it("searches nothing until Show results with a filter besides online or phone, and nothing again once it is removed", async () => {
    screenIs(true);
    renderAt(ONLINE);
    expect(prompt()).toBeTruthy();
    const show = () => within(filters()).getByRole("button", { name: "Show results" });
    expect(show().getAttribute("aria-disabled")).toBe("true");
    fireEvent.click(within(filters()).getByRole("button", { name: /^Type of session/ }));
    fireEvent.click(within(filters()).getByRole("checkbox", { name: "Telephone Therapy" }));
    expect(show().getAttribute("aria-disabled")).toBe("true");
    fireEvent.click(within(filters()).getByRole("button", { name: /^More filters/ }));
    fireEvent.click(within(filters()).getByRole("checkbox", { name: "Only show profiles with photos" }));
    expect(show().getAttribute("aria-disabled")).toBeNull();
    expect(url().toString()).toBe("");
    expect(api.search).not.toHaveBeenCalled();
    fireEvent.click(show());
    await loaded();
    expect(prompt()).toBeNull();
    expect(asked()).toBe("TypesOfSession=Telephone+Therapy&OnlyProfilesWithPhotos=true");
    expect(within(filters()).getByRole("button", { name: "Update results" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Remove Only show profiles with photos" }));
    expect(prompt()).toBeTruthy();
    expect(within(results()).queryByRole("link", { name: /^Therapist/ })).toBeNull();
    expect(api.search).toHaveBeenCalledOnce();
  });

  it.each([
    { screen: "wide", wide: true },
    { screen: "narrow", wide: false },
  ])("hands the keyboard to the first group of filters as the last chip goes, and the search with it, on $screen screens", async ({ wide }) => {
    screenIs(wide);
    renderAt(GREEK);
    await loaded();
    const chip = screen.getByRole("button", { name: "Remove Greek" });
    chip.focus();
    fireEvent.click(chip);
    expect(prompt()).toBeTruthy();
    // Right of the list, or on a phone beneath the prompt, where the filters go back to as the search ends.
    const holder = wide ? filters() : screen.getByRole("tabpanel", { name: "Results" });
    expect(document.activeElement).toBe(holder.querySelector('[data-slot="accordion-trigger"]'));
  });

  it("hands the keyboard to the filters beneath the prompt as a phone's filters sheet ends the search", async () => {
    screenIs(false);
    renderAt(GREEK);
    await loaded();
    fireEvent.click(screen.getByRole("button", { name: /^Filters/ }));
    const sheet = await screen.findByRole("dialog", { name: "Refine your search" });
    // Open already, as it holds a tick.
    fireEvent.click(within(sheet).getByRole("checkbox", { name: "Greek" }));
    fireEvent.click(within(sheet).getByRole("button", { name: "Show results" }));
    expect(prompt()).toBeTruthy();
    const panel = screen.getByRole("tabpanel", { name: "Results" });
    expect(document.activeElement).toBe(panel.querySelector('[data-slot="accordion-trigger"]'));
  });

  it("goes back to its prompt, asking UKCP nothing, when the last filter that narrows its search is unticked and the results updated", async () => {
    screenIs(true);
    renderAt(GREEK);
    await loaded();
    fireEvent.click(within(filters()).getByRole("checkbox", { name: "Greek" }));
    fireEvent.click(within(filters()).getByRole("button", { name: "Update results" }));
    expect(url().toString()).toBe("");
    expect(prompt()).toBeTruthy();
    expect(api.search).toHaveBeenCalledOnce();
  });

  it("tells a screen reader what the first search found, from a live region in place before it", async () => {
    screenIs(false);
    renderAt(ONLINE);
    const status = screen.getAllByRole("status").find((el) => el.tagName === "P");
    expect(status?.textContent).toBe("");
    const panel = screen.getByRole("tabpanel", { name: "Results" });
    fireEvent.click(within(panel).getByRole("button", { name: /^Languages/ }));
    fireEvent.click(within(panel).getByRole("checkbox", { name: "Greek" }));
    fireEvent.click(within(panel).getByRole("button", { name: "Show results" }));
    await waitFor(() => expect(status?.textContent).toBe("30 therapists working online or by phone."));
  });

  it("tells a screen reader what a search found though the shortlist's tab opened while it ran", async () => {
    screenIs(true);
    renderAt(ONLINE);
    const status = screen.getAllByRole("status").find((el) => el.tagName === "P");
    fireEvent.click(within(filters()).getByRole("button", { name: /^Languages/ }));
    fireEvent.click(within(filters()).getByRole("checkbox", { name: "Greek" }));
    fireEvent.click(within(filters()).getByRole("button", { name: "Show results" }));
    const tab = screen.getByRole("tab", { name: /^Shortlist/ });
    fireEvent.mouseDown(tab);
    fireEvent.click(tab);
    await waitFor(() => expect(status?.textContent).toBe("30 therapists working online or by phone."));
    expect(status?.closest("[hidden]")).toBeNull();
  });

  it("asks for no place, nor wheelchair access or a session type needing one, that a link carries", async () => {
    screenIs(true);
    renderAt(`${GREEK}&Location=Leeds&TypesOfSession=Face+to+Face+-+Long+Term&OnlyWheelchairAccessible=true`);
    await loaded();
    expect(asked()).toBe(GREEK_ONLINE);
    expect(screen.queryByRole("button", { name: "Remove Only show wheelchair accessible" })).toBeNull();
  });

  it("takes ticks still waiting along to the other view", async () => {
    screenIs(true);
    renderAt(SEARCH);
    await loaded();
    fireEvent.click(screen.getByRole("button", { name: "Filters" }));
    fireEvent.click(screen.getByRole("button", { name: /^Languages/ }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Greek" }));
    expect(screen.getByRole("link", { name: "Near me" }).getAttribute("href")).toBe("/?Location=Leeds");
    fireEvent.click(screen.getByRole("link", { name: "Online" }));
    expect([path(), url().toString()]).toEqual([ONLINE, "Languages=Greek"]);
    await loaded();
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

  it("leaves a click that opens the other view in a new tab to the browser", async () => {
    screenIs(true);
    renderAt(SEARCH);
    await loaded();
    // Read after the page's handlers, then stopped, as jsdom can't open the tab.
    let prevented: boolean | undefined;
    const read = (event: Event) => {
      prevented = event.defaultPrevented;
      event.preventDefault();
    };
    document.addEventListener("click", read);
    fireEvent.click(screen.getByRole("link", { name: "Online" }), { metaKey: true });
    document.removeEventListener("click", read);
    expect(prevented).toBe(false);
    expect(path()).toBe("/");
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
    await within(results()).findByRole("heading", { name: "1 result" });
    const inResults = within(screen.getByRole("tabpanel", { name: "Results" })).getByText("Online Therapy").outerHTML;
    pick(/^Shortlist/);
    expect(within(screen.getByRole("tabpanel", { name: /^Shortlist/ })).getByText("Online Therapy").outerHTML).toBe(inResults);
  });

  it("keeps its filters open to the right of the list on wide screens, offering only video and phone among the session types and no wheelchair access", async () => {
    screenIs(true);
    renderAt(GREEK);
    await loaded();
    expect(screen.queryByRole("button", { name: "Filters" })).toBeNull();
    expect(results().compareDocumentPosition(filters()) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    fireEvent.click(within(filters()).getByRole("button", { name: /^Type of session/ }));
    expect(within(filters()).queryByRole("checkbox", { name: "Face to Face - Long Term" })).toBeNull();
    fireEvent.click(within(filters()).getByRole("button", { name: /^More filters/ }));
    expect(within(filters()).queryByRole("checkbox", { name: "Only show wheelchair accessible" })).toBeNull();
    fireEvent.click(within(filters()).getByRole("checkbox", { name: "Telephone Therapy" }));
    fireEvent.click(within(filters()).getByRole("button", { name: "Update results" }));
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
    renderAt(GREEK);
    await loaded();
    fireEvent.click(screen.getByRole("button", { name: /^Filters/ }));
    expect((await screen.findByRole("dialog", { name: "Refine your search" })).dataset.side).toBe("right");
  });

  it("sets its filters out beneath the prompt on a phone before a search, with Show results at their foot once they narrow it", async () => {
    screenIs(false);
    renderAt(ONLINE);
    expect(screen.queryByRole("button", { name: "Filters" })).toBeNull();
    const panel = screen.getByRole("tabpanel", { name: "Results" });
    const show = within(panel).getByRole("button", { name: "Show results" });
    expect(show.getAttribute("aria-disabled")).toBe("true");
    fireEvent.click(within(panel).getByRole("button", { name: /^Type of session/ }));
    fireEvent.click(within(panel).getByRole("checkbox", { name: "Telephone Therapy" }));
    expect(show.getAttribute("aria-disabled")).toBe("true");
    fireEvent.click(within(panel).getByRole("button", { name: /^Languages/ }));
    fireEvent.click(within(panel).getByRole("checkbox", { name: "Greek" }));
    expect(url().toString()).toBe("");
    act(() => show.focus());
    fireEvent.click(show);
    expect(url().toString()).toBe("TypesOfSession=Telephone+Therapy&Languages=Greek");
    // Show results gives way to the results, handing the keyboard to their tab.
    expect(document.activeElement).toBe(screen.getByRole("tab", { name: "Results" }));
    await loaded();
  });

  it("leaves focus be on wide screens as a search begins, Show results staying where it is", async () => {
    screenIs(true);
    renderAt(ONLINE);
    fireEvent.click(within(filters()).getByRole("button", { name: /^Languages/ }));
    fireEvent.click(within(filters()).getByRole("checkbox", { name: "Greek" }));
    // As Safari leaves a clicked button unfocused.
    act(() => (document.activeElement as HTMLElement).blur());
    fireEvent.click(within(filters()).getByRole("button", { name: "Show results" }));
    await loaded();
    expect(document.activeElement).toBe(document.body);
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
    pick(/^Shortlist/);
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

  it("returns to the shortlist at its own place after Back from a profile opened from it", async () => {
    screenIs(true);
    shortlist.add(therapist("a"));
    renderAt(GREEK);
    await loaded();
    pick(/^Shortlist/);
    list().scrollTop = 400;
    fireEvent.scroll(list());
    fireEvent.click(screen.getByRole("link", { name: "Therapist a" }));
    fireEvent.click(await screen.findByRole("button", { name: "Back" }));
    expect(await screen.findByRole("tab", { name: /^Shortlist/, selected: true })).toBeTruthy();
    expect(list().scrollTop).toBe(400);
  });

  it("returns to the shortlist at its own place as the browser goes Forward to it from Near me", async () => {
    screenIs(true);
    shortlist.add(therapist("a"));
    renderAt(SEARCH);
    await loaded();
    fireEvent.click(screen.getByRole("link", { name: "Online" }));
    pick(/^Shortlist/);
    list().scrollTop = 400;
    fireEvent.scroll(list());
    travel(-1);
    await loaded();
    travel(1);
    expect(screen.getByRole("tab", { name: /^Shortlist/, selected: true })).toBeTruthy();
    expect(list().scrollTop).toBe(400);
  });

  it("keeps the shortlist in a tab beside the list, and beside the prompt before a search", async () => {
    screenIs(true);
    shortlist.add(therapist("a"));
    renderAt(ONLINE);
    expect(prompt()).toBeTruthy();
    expect(api.search).not.toHaveBeenCalled();
    pick(/^Shortlist/);
    expect(within(screen.getByRole("tabpanel", { name: /^Shortlist/ })).getByRole("link", { name: "Therapist a" })).toBeTruthy();
  });

  it.each([
    { screen: "wide", wide: true },
    { screen: "narrow", wide: false },
  ])("puts its toolbar and filters away while the shortlist is open on $screen screens", async ({ wide }) => {
    screenIs(wide);
    renderAt(GREEK);
    await loaded();
    pick(/^Shortlist/);
    expect(screen.queryByRole("link", { name: "Near me" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Remove Greek" })).toBeNull();
    expect(screen.queryByRole("button", { name: /^Filters/ })).toBeNull();
    expect(screen.queryByRole("region", { name: "Refine your search" })).toBeNull();
    pick(/^Results/);
    expect(screen.getByRole("link", { name: "Near me" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Remove Greek" })).toBeTruthy();
  });

  it("skips past the list to the filters on wide screens, bringing them back from beside the shortlist", async () => {
    screenIs(true);
    renderAt(GREEK);
    await loaded();
    const skip = screen.getByRole("link", { name: "Skip to the filters" });
    const first = () => within(filters()).getByRole("button", { name: /^Type of session/i });
    fireEvent.click(skip);
    expect(document.activeElement).toBe(first());
    const tab = screen.getByRole("tab", { name: /^Shortlist/ });
    fireEvent.mouseDown(tab);
    fireEvent.click(tab);
    expect(screen.queryByRole("region", { name: "Refine your search" })).toBeNull();
    fireEvent.click(skip);
    await waitFor(() => expect(document.activeElement).toBe(first()));
    expect(screen.getByRole("tabpanel", { name: "Results" })).toBeTruthy();
  });

  it("keeps the shortlist's scroll to itself beside the prompt", () => {
    screenIs(true);
    shortlist.add(therapist("a"));
    renderAt(ONLINE);
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
    await within(results()).findByRole("heading", { name: "1 result" });
    const saysNeither = (panel: HTMLElement) => {
      expect(within(panel).getByRole("link", { name: "Therapist a" })).toBeTruthy();
      expect(within(panel).queryByText("London E8")).toBeNull();
      expect(within(panel).queryByText(/In-person|Remote/)).toBeNull();
    };
    saysNeither(screen.getByRole("tabpanel", { name: "Results" }));
    pick(/^Shortlist/);
    saysNeither(screen.getByRole("tabpanel", { name: /^Shortlist/ }));
  });
});

describe("SearchPage ahead of a search", () => {
  it.each([
    ["near a place", SEARCH],
    ["online", "/online?KeywordFilter=grief"],
  ])("shows the search an address opens on %s as the entry script asked for it, asking no more", async (_, address) => {
    screenIs(true);
    answer([[therapist("a")]]);
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    prefetchSearchAt(client, `#${address}`);
    renderPage(address, client);
    expect(await within(results()).findByRole("link", { name: "Therapist a" })).toBeTruthy();
    expect(api.search).toHaveBeenCalledOnce();
  });

  it("fetches the map's code as the place box takes focus, before anything is searched", () => {
    screenIs(true);
    renderAt("/");
    vi.mocked(warmMap).mockClear();
    fireEvent.focus(screen.getByRole("textbox", { name: "Location" }));
    expect(warmMap).toHaveBeenCalled();
  });
});

describe("SearchPage's view transitions", () => {
  /** The types of each view transition React starts, each then going ahead unanimated, as in a browser without them. */
  let started: string[][];
  beforeEach(() => {
    started = [];
    Object.defineProperty(document, "startViewTransition", {
      configurable: true,
      value: ({ types }: { types: string[] }) => {
        started.push(types);
        throw new Error("No view transitions here");
      },
    });
  });
  afterEach(() => {
    delete (document as { startViewTransition?: unknown }).startViewTransition;
  });

  it("animates the switch between Near me and Online, either way, saying which", async () => {
    screenIs(true);
    renderAt(SEARCH);
    await loaded();
    fireEvent.click(screen.getByRole("link", { name: "Online" }));
    expect(started).toEqual([["morph", "to-online"]]);
    fireEvent.click(screen.getByRole("link", { name: "Near me" }));
    expect(started).toEqual([
      ["morph", "to-online"],
      ["morph", "to-near"],
    ]);
    await loaded();
  });

  it("animates a search near a place beginning or clearing, and no tick or search for another place", async () => {
    screenIs(true);
    renderAt("/");
    const filters = () => screen.getByRole("region", { name: "Refine your search" });
    fireEvent.click(within(filters()).getByRole("button", { name: /^Languages/ }));
    fireEvent.click(within(filters()).getByRole("checkbox", { name: "French" }));
    expect(url().get("Languages")).toBeNull();
    const search = (place: string) => {
      fireEvent.change(screen.getByRole("textbox", { name: "Location" }), { target: { value: place } });
      fireEvent.click(screen.getByRole("button", { name: "Search" }));
    };
    search("York");
    expect(started).toEqual([["morph"]]);
    await loaded();
    search("Leeds");
    expect(url().get("Location")).toBe("Leeds");
    fireEvent.change(screen.getByRole("textbox", { name: "Location" }), { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: /^Filters/ }));
    fireEvent.click(await screen.findByRole("button", { name: "Clear all filters" }));
    fireEvent.click(screen.getByRole("button", { name: "Close filters" }));
    expect(screen.getByText(/^Tick anything that matters to you/)).toBeTruthy();
    expect(started).toEqual([["morph"], ["morph"]]);
  });

  it.each([
    { view: "before a search near a place", address: "/", screen: "wide", wide: true },
    { view: "before a search near a place", address: "/", screen: "narrow", wide: false },
    { view: "online", address: "/online", screen: "wide", wide: true },
    { view: "online", address: "/online", screen: "narrow", wide: false },
  ])("animates the list moving into the toolbar's place as the shortlist opens $view on $screen screens, and back as it closes", async ({ address, wide }) => {
    screenIs(wide);
    shortlist.add(therapist("a"));
    renderAt(address);
    pick(/^Shortlist/);
    await waitFor(() => expect(started).toEqual([["morph"]]));
    pick(/^Results/);
    await waitFor(() => expect(started).toEqual([["morph"], ["morph"]]));
  });

  it.each([
    { screen: "wide", wide: true },
    { screen: "narrow", wide: false },
  ])("leaves the tabs unanimated over the map on $screen screens, as nothing moves", async ({ wide }) => {
    screenIs(wide);
    renderAt(SEARCH);
    await loaded();
    pick(/^Shortlist/);
    expect(screen.getByRole("tab", { name: /^Shortlist/ }).getAttribute("aria-selected")).toBe("true");
    expect(started).toEqual([]);
  });
});
