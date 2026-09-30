// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation, useNavigate } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { SearchResult, TherapistCard } from "@shared/types";
import { TooltipProvider } from "@/components/ui/tooltip";
import { api } from "@/lib/api";
import { listed } from "@/lib/listed.testing";
import type { Highlight } from "./map/highlight";
import { layoutPins, type Pin } from "./map/pins";
import { SearchPage } from "./SearchPage";

// Results keep the order they are answered in here; order.test.ts and useResults.test.tsx cover the order itself.
vi.mock("./order", () => ({ orderSeed: () => 0, inOrder: <T,>(listings: T[]) => listings }));

// Counted, to see whether a hover makes the page lay its pins out again.
vi.mock("./map/pins", async (importOriginal) => {
  const pins = await importOriginal<typeof import("./map/pins")>();
  return { ...pins, layoutPins: vi.fn(pins.layoutPins) };
});

// The map pane is tested on its own; here it shows what the page passed it, with a button for each pin.
vi.mock("./map/MapPane", async () => {
  const { createElement, useSyncExternalStore } = await import("react");
  type Props = { fitKey: string; centreSettled: boolean; pins: Pin[]; highlight: Highlight; selected?: Pin; onSelect: (pin: Pin) => void };
  return {
    default: ({ fitKey, centreSettled, pins, highlight, selected, onSelect }: Props) => {
      const slug = useSyncExternalStore(highlight.subscribe, highlight.get);
      return createElement(
        "div",
        {
          "data-testid": "map",
          "data-fit-key": fitKey,
          "data-settled": String(centreSettled),
          "data-highlighted": slug ?? "",
          "data-selected": selected?.key ?? "",
        },
        pins.map((pin) => createElement("button", { key: pin.key, type: "button", onClick: () => onSelect(pin) }, `Pin ${pin.key}`)),
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
  return <output data-testid="url">{useLocation().search}</output>;
}

function renderAt(url: string, ...pages: TherapistCard[][]) {
  answer(pages);
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <TooltipProvider>
        <MemoryRouter initialEntries={[url]}>
          <Routes>
            <Route
              path="/"
              element={
                <>
                  <SearchPage />
                  <Url />
                </>
              }
            />
            <Route path="/therapist/:slug" element={<Profile />} />
          </Routes>
        </MemoryRouter>
      </TooltipProvider>
    </QueryClientProvider>,
  );
}

/** A search whose answer, with no "Location searched", has no centre to look up. */
const SEARCH = "/?Location=Leeds";
const url = () => new URLSearchParams(screen.getByTestId("url").textContent ?? "");
const results = () => screen.getByRole("region", { name: "Results" });
const loaded = () => within(results()).findByText(/^\d+ of 30/);
/** The results' scrolling list, which holds everything but their header and footer. */
const list = () => results().querySelector<HTMLElement>(".overflow-y-auto")!;
const names = () => within(results()).getAllByRole("link", { name: /^Therapist/ }).map((link) => link.textContent);
/** Gives the lazily loaded map time to arrive, were the page to ask for it. */
const mapLoads = () => act(async () => void (await import("./map/MapPane")));

const BRIGHTON = { lat: 50.8225, lng: -0.1372 };
const HOVE = { lat: 50.835, lng: -0.178 };
/** A pin's key, as the pins make it from its point. */
const key = ({ lat, lng }: { lat: number; lng: number }) => `${lat.toFixed(5)},${lng.toFixed(5)}`;
/** Places a location by its postal district alone: BN3 in Hove, anywhere else in Brighton. */
function placeByDistrict() {
  vi.spyOn(api, "place").mockImplementation(async (text) => ({ found: true, kind: "outcode", candidates: [text.endsWith("BN3") ? HOVE : BRIGHTON] }));
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("SearchPage", () => {
  it("sets the results beside the map on wide screens, and can put them away", async () => {
    screenIs(true);
    renderAt(SEARCH);
    await loaded();
    expect(await screen.findByTestId("map")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Hide results" }));
    expect(screen.queryByRole("region", { name: "Results" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Show results" }));
    expect(results()).toBeTruthy();
  });

  it("asks for a search in place of the map and results when there is nothing to search for", async () => {
    screenIs(true);
    renderAt("/");
    await mapLoads();
    expect(screen.getByText(/^Search a town, city or postcode/)).toBeTruthy();
    expect(screen.getByRole("heading", { level: 1, name: "Find a UKCP therapist" })).toBeTruthy();
    expect(screen.queryByRole("region", { name: "Results" })).toBeNull();
    expect(screen.queryByTestId("map")).toBeNull();
    expect(api.search).not.toHaveBeenCalled();
    fireEvent.change(screen.getByRole("textbox", { name: "Location" }), { target: { value: "York" } });
    fireEvent.click(screen.getByRole("button", { name: "Search" }));
    await loaded();
    expect(await screen.findByTestId("map")).toBeTruthy();
    expect(screen.queryByText(/^Search a town, city or postcode/)).toBeNull();
  });

  it("takes the outside-UK tick alone as nothing to search for", async () => {
    screenIs(true);
    renderAt("/?LocationSearchOutsideUK=true");
    await mapLoads();
    expect(screen.getByText(/^Search a town, city or postcode/)).toBeTruthy();
    expect(screen.queryByTestId("map")).toBeNull();
    expect(api.search).not.toHaveBeenCalled();
  });

  it("goes back to the prompt in place of the map and results when the location is cleared, and opens the next search on its list", async () => {
    screenIs(false);
    renderAt(SEARCH);
    await loaded();
    expect(await screen.findByTestId("map")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Show map" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Location" }), { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: "Search" }));
    expect(screen.getByText(/^Search a town, city or postcode/)).toBeTruthy();
    expect(screen.queryByRole("region", { name: "Results" })).toBeNull();
    expect(screen.queryByTestId("map")).toBeNull();
    fireEvent.change(screen.getByRole("textbox", { name: "Location" }), { target: { value: "York" } });
    fireEvent.click(screen.getByRole("button", { name: "Search" }));
    expect(results().dataset.position).toBe("full");
    await loaded();
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

  it("opens the filters beside the prompt on wide screens, open as they search until a search for a place puts them away", async () => {
    screenIs(true);
    renderAt("/");
    const filters = () => screen.queryByRole("region", { name: "Refine your search" });
    expect(filters()).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Search" }));
    expect(filters()).toBeTruthy();
    const keyword = screen.getByRole("searchbox", { name: "Keyword search" });
    fireEvent.change(keyword, { target: { value: "grief" } });
    fireEvent.submit(keyword.closest("form")!);
    await loaded();
    expect(filters()).toBeTruthy();
    fireEvent.change(screen.getByRole("textbox", { name: "Location" }), { target: { value: "York" } });
    fireEvent.click(screen.getByRole("button", { name: "Search" }));
    expect(filters()).toBeNull();
    await loaded();
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

  it("keeps the filters shut on a phone's prompt that widens, as they open only on arriving wide", () => {
    const resize = screenIs(false);
    renderAt("/");
    resize(true);
    expect(screen.queryByRole("region", { name: "Refine your search" })).toBeNull();
  });

  it("leaves the outside-UK tick out of the Filters count, as Clear all keeps it", async () => {
    screenIs(true);
    renderAt("/?LocationSearchOutsideUK=true&Languages=French");
    await loaded();
    expect(screen.getByRole("button", { name: "Filters, 1 ticked" })).toBeTruthy();
  });

  it("opens the filters in a sheet on narrow screens", async () => {
    screenIs(false);
    renderAt(SEARCH);
    await loaded();
    fireEvent.click(screen.getByRole("button", { name: "Filters" }));
    expect(await screen.findByRole("dialog", { name: "Refine your search" })).toBeTruthy();
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
    await screen.findByRole("region", { name: "Results" });
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

  it("heads an invalid search link with the site's name", () => {
    renderAt("/?OnlyProfilesWithPhotos=yes");
    expect(screen.getByRole("alert").textContent).toContain("This search link isn't valid");
    expect(screen.getByRole("heading", { level: 1, name: "Find a UKCP therapist" })).toBeTruthy();
  });

  it("heads the side bar with the site's name and theme switch, which hide with the results", async () => {
    screenIs(true);
    renderAt(SEARCH);
    await loaded();
    expect(screen.getByRole("heading", { level: 1, name: "Find a UKCP therapist" })).toBeTruthy();
    expect(screen.getByRole("group", { name: "Theme" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Hide results" }));
    expect(screen.queryByRole("heading", { level: 1 })).toBeNull();
    expect(screen.queryByRole("group", { name: "Theme" })).toBeNull();
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
      ["H2", "BN3 2 therapists"],
      ["H3", "Therapist a"],
      ["H3", "Therapist c"],
    ]);
    expect(names()).toEqual(["Therapist a", "Therapist c", "Therapist b"]);
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
    fireEvent.click(screen.getByRole("button", { name: "Hide results" }));
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
});
