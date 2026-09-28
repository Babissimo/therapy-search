// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation, useNavigate } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { SearchResult, TherapistCard } from "@shared/types";
import { TooltipProvider } from "@/components/ui/tooltip";
import { api } from "@/lib/api";
import { SearchPage } from "./SearchPage";

// The map pane is tested on its own; here it shows what the page passed it.
vi.mock("./map/MapPane", async () => {
  const { createElement } = await import("react");
  return {
    default: ({ centreSettled, radiusMiles }: { centreSettled: boolean; radiusMiles: number }) =>
      createElement("div", { "data-testid": "map", "data-settled": String(centreSettled), "data-radius": radiusMiles }),
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

/** Thirty results, twelve a page; no place is searched, so no centre is looked up. */
function answer() {
  vi.spyOn(api, "search").mockImplementation(async (query): Promise<SearchResult> => {
    const page = Number(new URLSearchParams(query).get("page") ?? 1);
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

function renderAt(url: string) {
  answer();
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

const url = () => new URLSearchParams(screen.getByTestId("url").textContent ?? "");
const results = () => screen.getByRole("region", { name: "Results" });
const loaded = () => within(results()).findByText(/^\d+ of 30/);

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("SearchPage", () => {
  it("sets the results beside the map on wide screens, and can put them away", async () => {
    screenIs(true);
    renderAt("/?Location=Leeds");
    await loaded();
    expect(await screen.findByTestId("map")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Hide results" }));
    expect(screen.queryByRole("region", { name: "Results" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Show results (30)" }));
    expect(results()).toBeTruthy();
  });

  it("lays the results over the map on narrow screens, starting on the list", async () => {
    screenIs(false);
    renderAt("/?Location=Leeds");
    await loaded();
    expect(results().dataset.position).toBe("full");
    fireEvent.click(screen.getByRole("button", { name: "Show map" }));
    expect(results().dataset.position).toBe("peek");
  });

  it("opens the filters beneath the search box on wide screens", async () => {
    screenIs(true);
    renderAt("/");
    await loaded();
    fireEvent.click(screen.getByRole("button", { name: "Filters" }));
    expect(screen.getByRole("region", { name: "Refine your search" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Close filters" }));
    expect(screen.queryByRole("region", { name: "Refine your search" })).toBeNull();
  });

  it("opens the filters in a sheet on narrow screens", async () => {
    screenIs(false);
    renderAt("/");
    await loaded();
    fireEvent.click(screen.getByRole("button", { name: "Filters" }));
    expect(await screen.findByRole("dialog", { name: "Refine your search" })).toBeTruthy();
  });

  it("draws the circle at the slider's distance, and searches from the box with the typed keyword", async () => {
    screenIs(true);
    renderAt("/");
    await loaded();
    fireEvent.click(screen.getByRole("button", { name: "Filters" }));
    fireEvent.change(screen.getByRole("searchbox", { name: "Keyword search" }), { target: { value: "grief" } });
    fireEvent.keyDown(screen.getByRole("slider"), { key: "ArrowRight" });
    expect((await screen.findByTestId("map")).dataset.radius).toBe("11");
    fireEvent.change(screen.getByRole("textbox", { name: "Location" }), { target: { value: "York" } });
    fireEvent.click(screen.getByRole("button", { name: "Search" }));
    expect([url().get("Location"), url().get("KeywordFilter"), url().get("Distance")]).toEqual(["York", "grief", "11"]);
    await loaded();
  });

  it("holds the map's framing while a new search loads, as what it shows is still the last search's", async () => {
    screenIs(true);
    renderAt("/");
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
    renderAt("/?Location=Leeds");
    const list = () => results().lastElementChild as HTMLElement;
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
    renderAt("/?Location=Leeds");
    const list = () => results().lastElementChild as HTMLElement;
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
    renderAt("/?Distance=abc");
    expect(screen.getByRole("alert").textContent).toContain("This search link isn't valid");
    expect(screen.getByText(/Not affiliated with or endorsed by UKCP/)).toBeTruthy();
  });

  it("closes the results with the disclaimer", async () => {
    screenIs(true);
    renderAt("/");
    await loaded();
    expect(within(results()).getByText(/Not affiliated with or endorsed by UKCP/)).toBeTruthy();
  });
});
