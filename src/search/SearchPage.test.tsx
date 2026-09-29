// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation, useNavigate } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { SearchResult, TherapistCard } from "@shared/types";
import { TooltipProvider } from "@/components/ui/tooltip";
import { api } from "@/lib/api";
import type { Highlight } from "./map/highlight";
import { layoutPins, type Pin } from "./map/pins";
import { SearchPage } from "./SearchPage";

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
  vi.spyOn(api, "search").mockImplementation(async (query): Promise<SearchResult> => {
    const page = Number(new URLSearchParams(query).get("page") ?? 1);
    if (pages.length > 0) {
      const before = pages.slice(0, page - 1).flat().length;
      const therapists = pages[page - 1] ?? [];
      return { total: pages.flat().length, from: before + 1, to: before + therapists.length, notices: [], therapists };
    }
    const therapists = Array.from({ length: 12 }, (_, i) => therapist(`p${page}-${i}`));
    return { total: 30, from: (page - 1) * 12 + 1, to: page * 12, notices: [], therapists };
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

  it("asks for a search rather than listing everyone when there is nothing to search for", async () => {
    screenIs(true);
    renderAt("/");
    expect(within(results()).getByText(/^Search a town, city or postcode/)).toBeTruthy();
    expect(await screen.findByTestId("map")).toBeTruthy();
    expect(api.search).not.toHaveBeenCalled();
    fireEvent.change(screen.getByRole("textbox", { name: "Location" }), { target: { value: "York" } });
    fireEvent.click(screen.getByRole("button", { name: "Search" }));
    await loaded();
  });

  it("takes the outside-UK tick alone as nothing to search for", async () => {
    screenIs(true);
    renderAt("/?LocationSearchOutsideUK=true");
    expect(within(results()).getByText(/^Search a town, city or postcode/)).toBeTruthy();
    expect((await screen.findByTestId("map")).dataset.fitKey).toBe("");
    expect(api.search).not.toHaveBeenCalled();
  });

  it("goes back to the prompt, the UK and a half-raised sheet when the location is cleared", async () => {
    screenIs(false);
    renderAt(SEARCH);
    await loaded();
    expect(results().dataset.position).toBe("full");
    fireEvent.change(screen.getByRole("textbox", { name: "Location" }), { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: "Search" }));
    expect(within(results()).getByText(/^Search a town, city or postcode/)).toBeTruthy();
    expect(results().dataset.position).toBe("half");
    expect(screen.getByTestId("map").dataset.fitKey).toBe("");
  });

  it("opens a phone with the map in view beside the prompt", () => {
    screenIs(false);
    renderAt("/");
    expect(results().dataset.position).toBe("half");
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
    vi.spyOn(api, "search").mockResolvedValue({ total: 1, from: 1, to: 1, notices: [], therapists: [therapist("a")], locationSearched: "Leeds, UK" });
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

  it("holds the map's framing while a new search loads, as what it shows is still the last search's", async () => {
    screenIs(true);
    renderAt(SEARCH);
    await loaded();
    expect((await screen.findByTestId("map")).dataset.settled).toBe("true");
    let arrive: (result: SearchResult) => void = () => {};
    vi.mocked(api.search).mockImplementationOnce(() => new Promise((resolve) => (arrive = resolve)));
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

  it("ends an invalid search link with the disclaimer too", () => {
    renderAt("/?OnlyProfilesWithPhotos=yes");
    expect(screen.getByRole("alert").textContent).toContain("This search link isn't valid");
    expect(screen.getByText(/Not affiliated with or endorsed by UKCP/)).toBeTruthy();
  });

  it("closes the results with the disclaimer", async () => {
    screenIs(true);
    renderAt(SEARCH);
    await loaded();
    expect(within(results()).getByText(/Not affiliated with or endorsed by UKCP/)).toBeTruthy();
  });

  it("says which therapists the map can't place, and why", async () => {
    screenIs(true);
    vi.spyOn(api, "place").mockResolvedValue({ found: true, kind: "outcode", candidates: [{ lat: 50.83, lng: -0.15 }] });
    renderAt(SEARCH, [therapist("a", "BRIGHTON BN3"), therapist("b", " BN")]);
    expect(await within(results()).findByText("2 of 2 · 1 not on the map")).toBeTruthy();
    expect(within(results()).getByText("Location too general to place")).toBeTruthy();
    expect(within(results()).getByText("Pins show the postcode or area each therapist lists.")).toBeTruthy();
  });

  it("shows who is at a pin above the results until cleared, raising the sheet halfway and marking the pin", async () => {
    screenIs(false);
    vi.spyOn(api, "place").mockResolvedValue({ found: true, kind: "outcode", candidates: [{ lat: 50.83, lng: -0.15 }] });
    renderAt(SEARCH, [therapist("a", "BRIGHTON BN3"), therapist("b", "Hove BN3")]);
    fireEvent.click(screen.getByRole("button", { name: "Show map" }));
    const pin = await screen.findByRole("button", { name: /^Pin / });
    fireEvent.click(pin);
    const here = screen.getByRole("region", { name: "At this pin" });
    expect(within(here).getAllByRole("link").map((link) => link.textContent)).toEqual(["Therapist a", "Therapist b"]);
    expect(results().dataset.position).toBe("half");
    expect(screen.getByTestId("map").dataset.selected).toBe(pin.textContent?.replace(/^Pin /, ""));
    fireEvent.click(screen.getByRole("button", { name: "Clear selection" }));
    expect(screen.queryByRole("region", { name: "At this pin" })).toBeNull();
    expect(screen.getByTestId("map").dataset.selected).toBe("");
  });

  it("clears the selection when its pin is activated again", async () => {
    screenIs(true);
    vi.spyOn(api, "place").mockResolvedValue({ found: true, kind: "outcode", candidates: [{ lat: 50.83, lng: -0.15 }] });
    renderAt(SEARCH, [therapist("a", "BRIGHTON BN3"), therapist("b", "Hove BN3")]);
    const pin = await screen.findByRole("button", { name: /^Pin / });
    fireEvent.click(pin);
    expect(screen.getByRole("region", { name: "At this pin" })).toBeTruthy();
    fireEvent.click(pin);
    expect(screen.queryByRole("region", { name: "At this pin" })).toBeNull();
    expect(screen.getByTestId("map").dataset.selected).toBe("");
    fireEvent.click(pin);
    expect(screen.getByRole("region", { name: "At this pin" })).toBeTruthy();
  });

  it("adds whoever joins the selected pin as more results load", async () => {
    screenIs(true);
    vi.spyOn(api, "place").mockResolvedValue({ found: true, kind: "outcode", candidates: [{ lat: 50.83, lng: -0.15 }] });
    renderAt(SEARCH, [therapist("a", "BRIGHTON BN3"), therapist("b", "Hove BN3")], [therapist("c", "Brighton BN3")]);
    fireEvent.click(await screen.findByRole("button", { name: /^Pin / }));
    const here = () => within(screen.getByRole("region", { name: "At this pin" })).getAllByRole("link").map((link) => link.textContent);
    expect(here()).toEqual(["Therapist a", "Therapist b"]);
    fireEvent.click(screen.getByRole("button", { name: "Load more" }));
    await waitFor(() => expect(here()).toEqual(["Therapist a", "Therapist b", "Therapist c"]));
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
    vi.mocked(api.search).mockImplementationOnce(() => new Promise((resolve) => (arrive = resolve)));
    fireEvent.change(screen.getByRole("textbox", { name: "Location" }), { target: { value: "York" } });
    fireEvent.click(screen.getByRole("button", { name: "Search" }));
    await act(async () => arrive({ total: 1, from: 1, to: 1, notices: [], therapists: [therapist("p1-2")] }));
    await within(results()).findByText(/^1 of 1/);
    expect(screen.getByTestId("map").dataset.highlighted).toBe("");
  });
});
