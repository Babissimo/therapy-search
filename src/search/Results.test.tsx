// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { useRef } from "react";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BATCH_SIZE, emptyParams, type SearchParams } from "@shared/query";
import { TooltipProvider } from "@/components/ui/tooltip";
import { api, ApiError } from "@/lib/api";
import { listed } from "@/lib/listed.testing";
import { createShortlistStore, type ShortlistStore } from "@/shortlist/store";
import { ShortlistContext } from "@/shortlist/useShortlist";
import { LoadMore } from "./LoadMore";
import type { Pin } from "./map/pins";
import { Results } from "./Results";
import { withFlag, withHelpWithTerms, withText } from "./state";
import { useResults } from "./useResults";

// Results keep the order they are answered in here; order.test.ts and useResults.test.tsx cover the order itself.
vi.mock("./order", () => ({ orderSeed: () => 0, inOrder: <T,>(listings: T[]) => listings, settled: <T,>(listings: T[]) => listings }));

const TOO_MANY = "Too many searches in a short time. Wait a minute and try again.";

/**
 * UKCP answering each request for a batch with `size` results, batch n's cards n tenths of a mile away. Answering
 * twelve, fewer than the site asks for, makes every Load more a request. `fail` names a batch that fails.
 */
function answerBatches({ total = 30, size = 12, fail }: { total?: number; size?: number; fail?: number } = {}) {
  return vi.spyOn(api, "search").mockImplementation(async (query) => {
    const q = new URLSearchParams(query);
    const page = Number(q.get("page") ?? 1);
    if (page === fail) throw new ApiError(429, TOO_MANY);
    const from = (page - 1) * size + 1;
    const to = Math.min(page * size, total);
    const therapists = Array.from({ length: to - from + 1 }, (_, i) => ({
      slug: `p${page}-${i}`,
      name: `Therapist ${page}-${i}`,
      initials: "T",
      tags: [],
      distance: `${page / 10} miles from Leeds`,
    }));
    return listed({ total, from, to, notices: [], therapists, locationSearched: q.get("Location") ?? undefined });
  });
}

/** The pins and whether they are still being placed, as the search page would pass them. */
type Placing = { pins?: Pin[]; placing?: boolean };

function Harness({ params, pins, placing }: { params: SearchParams } & Placing) {
  const results = useResults(params);
  const listRef = useRef<HTMLUListElement>(null);
  return (
    <>
      <Results params={params} results={results} listRef={listRef} pins={pins} />
      <LoadMore results={results} listRef={listRef} placing={placing} />
    </>
  );
}

function renderResults(params: SearchParams, shortlist: ShortlistStore = createShortlistStore(null)) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const ui = (next: SearchParams, placing: Placing = {}) => (
    <QueryClientProvider client={client}>
      <TooltipProvider>
        <ShortlistContext.Provider value={shortlist}>
          <MemoryRouter>
            <Harness params={next} {...placing} />
          </MemoryRouter>
        </ShortlistContext.Provider>
      </TooltipProvider>
    </QueryClientProvider>
  );
  const view = render(ui(params));
  return { rerender: (next: SearchParams, placing?: Placing) => view.rerender(ui(next, placing)) };
}

const leeds = withText(emptyParams(), "Location", "Leeds");
const cards = () => screen.queryAllByRole("link", { name: /^Therapist/ });

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("Results", () => {
  const SLOW = /^Getting every result/;

  it("says why a search without a location is taking a while, once it has", () => {
    vi.useFakeTimers();
    vi.spyOn(api, "search").mockImplementation(() => new Promise(() => {}));
    renderResults(emptyParams());
    act(() => vi.advanceTimersByTime(1900));
    expect(screen.queryByText(SLOW)).toBeNull();
    act(() => vi.advanceTimersByTime(100));
    expect(screen.getByText(SLOW).textContent).toBe("Getting every result. The first time can take a few seconds.");
  });

  it("says nothing of the kind while a location search loads", () => {
    vi.useFakeTimers();
    vi.spyOn(api, "search").mockImplementation(() => new Promise(() => {}));
    renderResults(leeds);
    act(() => vi.advanceTimersByTime(5000));
    expect(screen.queryByText(SLOW)).toBeNull();
  });

  it("keeps the list's stand-in from screen readers while a search loads", () => {
    vi.spyOn(api, "search").mockImplementation(() => new Promise(() => {}));
    renderResults(leeds);
    expect(screen.queryAllByRole("heading")).toEqual([]);
    expect(screen.queryAllByRole("alert")).toEqual([]);
  });

  it("shows the nearest few in place of the stand-in while the first batch is on its way, and Load more once it lands", async () => {
    let release!: () => void;
    const released = new Promise<void>((resolve) => (release = resolve));
    const batches = answerBatches();
    const answer = batches.getMockImplementation()!;
    batches.mockImplementation(async (query) => {
      await released;
      return answer(query);
    });
    vi.spyOn(api, "searchEarly").mockImplementation(answer);
    renderResults(leeds);
    expect(await screen.findByRole("heading", { name: "12 results within 0.1 miles" })).toBeTruthy();
    expect([cards().length, screen.queryByRole("button", { name: "Load more" })]).toEqual([12, null]);
    await act(async () => release());
    expect(await screen.findByRole("button", { name: "Load more" })).toBeTruthy();
    expect(cards()).toHaveLength(12);
  });

  it("heads a searched place's list with how many have loaded and how far out they reach, over the place", async () => {
    answerBatches();
    renderResults(leeds);
    const heading = await screen.findByRole("heading", { name: "12 results within 0.1 miles" });
    expect(heading.nextElementSibling?.textContent).toBe("Leeds");
    expect(screen.getByText(/^Nearest first/).textContent).toBe(
      "Nearest first, measured from the centre of the place searched. Pins show the postcode or area each therapist lists.",
    );
  });

  it("leaves out UKCP's notices about its own pages, keeping its others", async () => {
    const random = "Location searches are grouped by distance from the centre point of the search. Results are displayed in a random order.";
    const fewer = "This search returns more than 24 results. You may wish to try narrowing your search by specifying additional filters.";
    const none = "No therapists can be found matching your exact query. Why not try using fewer search terms or filters?";
    vi.spyOn(api, "search").mockResolvedValue(listed({ total: 0, from: 0, to: 0, notices: [random, fewer, none], therapists: [], locationSearched: "Leeds" }));
    renderResults(leeds);
    await screen.findByRole("heading", { name: "No results within your area" });
    expect(screen.getAllByRole("alert").map((alert) => alert.textContent)).toEqual([none]);
  });

  it("says once, and only once, that a search found no one, and where", async () => {
    answerBatches({ total: 0 });
    renderResults(leeds);
    const heading = await screen.findByRole("heading", { name: "No results within your area" });
    expect(heading.nextElementSibling?.textContent).toBe("Leeds");
    expect(screen.queryByText("No results")).toBeNull();
    expect(screen.queryByText(/Pins show/)).toBeNull();
  });

  it("shows the nearest page, and adds the next with Load more", async () => {
    answerBatches();
    renderResults(leeds);
    await screen.findByRole("heading", { name: "12 results within 0.1 miles" });
    fireEvent.click(screen.getByRole("button", { name: "Load more" }));
    await screen.findByRole("heading", { name: "24 results within 0.2 miles" });
    expect(cards()).toHaveLength(24);
  });

  it("shows the next twelve from the batch in hand without asking UKCP again", async () => {
    const search = answerBatches({ size: BATCH_SIZE });
    renderResults(leeds);
    await screen.findByRole("heading", { name: "12 results within 0.1 miles" });
    fireEvent.click(screen.getByRole("button", { name: "Load more" }));
    await screen.findByRole("heading", { name: /^24 results/ });
    fireEvent.click(screen.getByRole("button", { name: "Load more" }));
    await screen.findByRole("heading", { name: /^30 results/ });
    expect(search).toHaveBeenCalledOnce();
  });

  it("asks for the next batch once the one in hand runs out", async () => {
    const search = answerBatches({ size: 24 });
    renderResults(leeds);
    fireEvent.click(await screen.findByRole("button", { name: "Load more" }));
    await screen.findByRole("heading", { name: /^24 results/ });
    expect(search).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole("button", { name: "Load more" }));
    await screen.findByRole("heading", { name: /^30 results/ });
    expect(search.mock.calls.map(([query]) => new URLSearchParams(query).get("page"))).toEqual([null, "2"]);
  });

  it("steps by the batches UKCP gives when it answers fewer than asked for", async () => {
    answerBatches({ size: 18 });
    renderResults(leeds);
    await screen.findByRole("heading", { name: /^12 results/ });
    fireEvent.click(screen.getByRole("button", { name: "Load more" }));
    await screen.findByRole("heading", { name: /^18 results/ });
    fireEvent.click(screen.getByRole("button", { name: "Load more" }));
    await screen.findByRole("heading", { name: /^30 results/ });
    expect(cards()).toHaveLength(30);
  });

  it("keeps Load more in reach of the keyboard while the next page loads, and says it is loading", async () => {
    const search = answerBatches();
    renderResults(leeds);
    const more = await screen.findByRole("button", { name: "Load more" });
    const answer = search.getMockImplementation();
    let release = () => {};
    search.mockImplementationOnce(async (query) => {
      await new Promise<void>((resolve) => (release = resolve));
      return answer!(query);
    });
    fireEvent.click(more);
    // The spinner shows the next page is on its way.
    await waitFor(() => expect(more.querySelector(".animate-spin")).not.toBeNull());
    expect((more as HTMLButtonElement).disabled).toBe(false);
    expect(more.getAttribute("aria-disabled")).toBe("true");
    act(() => more.focus());
    expect(document.activeElement).toBe(more);
    const status = screen.getByText("Loading more results");
    expect(status.getAttribute("aria-live")).toBe("polite");
    fireEvent.click(more);
    expect(search).toHaveBeenCalledTimes(2);
    await act(async () => release());
    await screen.findByRole("heading", { name: /^24 results/ });
    expect(status.textContent).toBe("");
  });

  it("stops offering more once everything is loaded", async () => {
    answerBatches();
    renderResults(leeds);
    fireEvent.click(await screen.findByRole("button", { name: "Load more" }));
    await screen.findByRole("heading", { name: /^24 results/ });
    fireEvent.click(screen.getByRole("button", { name: "Load more" }));
    await screen.findByRole("heading", { name: /^30 results/ });
    expect(screen.queryByRole("button", { name: "Load more" })).toBeNull();
  });

  it("carries keyboard focus from Load more to the first card of the last page", async () => {
    answerBatches();
    renderResults(leeds);
    const more = await screen.findByRole("button", { name: "Load more" });
    act(() => more.focus());
    fireEvent.click(more);
    await screen.findByRole("heading", { name: /^24 results/ });
    expect(document.activeElement).toBe(more);
    fireEvent.click(more);
    await screen.findByRole("heading", { name: /^30 results/ });
    expect(document.activeElement).toBe(screen.getByRole("link", { name: "Therapist 3-0" }));
  });

  it("carries keyboard focus on to the first new entry once the last page's cards have found their pins", async () => {
    answerBatches({ total: 24 });
    const view = renderResults(leeds);
    const more = await screen.findByRole("button", { name: "Load more" });
    view.rerender(leeds, { placing: true });
    act(() => more.focus());
    fireEvent.click(more);
    await screen.findByRole("heading", { name: /^24 results/ });
    expect(document.activeElement).toBe(document.body);
    const card = (slug: string) => ({ slug, name: `Therapist ${slug.slice(1)}`, initials: "T", tags: [] });
    const pin = (...slugs: string[]): Pin => ({ key: slugs.join(), point: { lat: 53.8, lng: -1.55 }, therapists: slugs.map(card), kind: "outcode" });
    // One of the new cards joins a card already listed, and the next two share a pin of their own.
    view.rerender(leeds, { pins: [pin("p1-0", "p2-0"), pin("p2-1", "p2-2")] });
    expect(document.activeElement).toBe(screen.getByRole("link", { name: "Therapist 2-1" }));
  });

  it("leaves focus alone when Load more didn't have it", async () => {
    answerBatches();
    renderResults(leeds);
    fireEvent.click(await screen.findByRole("button", { name: "Load more" }));
    await screen.findByRole("heading", { name: /^24 results/ });
    fireEvent.click(screen.getByRole("button", { name: "Load more" }));
    await screen.findByRole("heading", { name: /^30 results/ });
    expect(document.activeElement).toBe(document.body);
  });

  it("leaves focus where the visitor moved it while the last page loaded", async () => {
    const search = answerBatches({ total: 24 });
    renderResults(leeds);
    const more = await screen.findByRole("button", { name: "Load more" });
    const answer = search.getMockImplementation();
    let release = () => {};
    search.mockImplementationOnce(async (query) => {
      await new Promise<void>((resolve) => (release = resolve));
      return answer!(query);
    });
    act(() => more.focus());
    fireEvent.click(more);
    const elsewhere = screen.getByRole("link", { name: "Therapist 1-0" });
    act(() => elsewhere.focus());
    await waitFor(() => expect(search).toHaveBeenCalledTimes(2));
    await act(async () => release());
    await screen.findByRole("heading", { name: /^24 results/ });
    expect(document.activeElement).toBe(elsewhere);
  });

  it("shows each card only the tags the search asked for, in a pin's box too", async () => {
    const tagged = (slug: string) => ({ slug, name: `Therapist ${slug}`, initials: "T", tags: ["Anxiety", "Trauma"] });
    const therapists = ["a", "b", "c"].map(tagged);
    vi.spyOn(api, "search").mockResolvedValue(listed({ total: 3, from: 1, to: 3, notices: [], therapists }));
    const params = withHelpWithTerms(leeds, ["Anxiety"]);
    const view = renderResults(params);
    await screen.findByRole("link", { name: "Therapist a" });
    view.rerender(params, { pins: [{ key: "LS1", point: { lat: 53.8, lng: -1.55 }, therapists: therapists.slice(1), kind: "outcode" }] });
    expect(screen.getAllByText("Anxiety")).toHaveLength(3);
    expect(within(screen.getByRole("group")).getAllByText("Anxiety")).toHaveLength(2);
    expect(screen.queryByText("Trauma")).toBeNull();
  });

  it("gives each card the fee its profile names for its office once read, in a pin's box too", async () => {
    const at = (slug: string, location: string) => ({ slug, name: `Therapist ${slug}`, initials: "T", tags: [], location });
    const therapists = [at("a", "Leeds LS1"), at("b", "Leeds LS2"), at("c", "Leeds LS2")];
    vi.spyOn(api, "search").mockResolvedValue(listed({ total: 3, from: 1, to: 3, notices: [], therapists }));
    const office = vi.spyOn(api, "office").mockImplementation(async (slug) => (slug === "b" ? {} : { cost: `£${slug === "a" ? 60 : 70}` }));
    const view = renderResults(leeds);
    await screen.findByText("£60");
    view.rerender(leeds, { pins: [{ key: "LS2", point: { lat: 53.8, lng: -1.55 }, therapists: therapists.slice(1), kind: "outcode" }] });
    within(screen.getByRole("group")).getByText("£70");
    expect(screen.getAllByText("Fees:")).toHaveLength(2);
    expect(office.mock.calls.map(([slug, location]) => [slug, location])).toEqual([
      ["a", "LEEDS LS1"],
      ["b", "LEEDS LS2"],
      ["c", "LEEDS LS2"],
    ]);
  });

  it("says where the visitor stands with each shortlisted therapist, in a pin's box too, and fades those set aside in place", async () => {
    const named = (slug: string) => ({ slug, name: `Therapist ${slug}`, initials: "T", tags: [] });
    const therapists = ["a", "b", "c", "d"].map(named);
    vi.spyOn(api, "search").mockResolvedValue(listed({ total: 4, from: 1, to: 4, notices: [], therapists }));
    const shortlist = createShortlistStore(null);
    shortlist.add(therapists[0]!, { status: "contacted" });
    shortlist.add(therapists[1]!);
    shortlist.add(therapists[3]!, { status: "setAside" });
    const view = renderResults(leeds, shortlist);
    await screen.findByRole("link", { name: "Therapist a" });
    view.rerender(leeds, { pins: [{ key: "LS1", point: { lat: 53.8, lng: -1.55 }, therapists: therapists.slice(2), kind: "outcode" }] });
    const card = (slug: string) => screen.getByRole("link", { name: `Therapist ${slug}` }).closest<HTMLElement>("[data-slot=card]")!;
    const faded = (slug: string) => /\bopacity-60\b/.test(within(card(slug)).getByText("T").closest("[data-slot=avatar]")?.parentElement?.className ?? "");
    expect(within(card("a")).getByText("Contacted").closest("p")?.textContent).toBe("Status: Contacted");
    // "To contact" goes unsaid, as does anything for a therapist not shortlisted.
    expect(within(card("b")).queryByText(/Status/)).toBeNull();
    expect(within(card("c")).queryByText(/Status/)).toBeNull();
    within(screen.getByRole("group")).getByText("Set aside");
    expect(["a", "b", "c", "d"].map(faded)).toEqual([false, false, false, true]);
    act(() => shortlist.setStatus("a", "setAside"));
    within(card("a")).getByText("Set aside");
    expect(faded("a")).toBe(true);
    // Set aside, they keep their place among the results.
    expect(cards().map((link) => link.textContent)).toEqual(["Therapist a", "Therapist b", "Therapist c", "Therapist d"]);
    // Brought back, they are no longer faded.
    act(() => shortlist.setStatus("a", "contacted"));
    expect(within(card("a")).getByText("Contacted").closest("p")?.textContent).toBe("Status: Contacted");
    expect(faded("a")).toBe(false);
  });

  it("asks nothing of profiles in a search outside the UK", async () => {
    vi.spyOn(api, "search").mockResolvedValue(
      listed({ total: 1, from: 1, to: 1, notices: [], therapists: [{ slug: "a", name: "Therapist a", initials: "T", tags: [], location: "Paris 75001" }] }),
    );
    const office = vi.spyOn(api, "office");
    renderResults(withFlag(withText(emptyParams(), "Location", "Paris"), "LocationSearchOutsideUK", true));
    await screen.findByRole("link", { name: "Therapist a" });
    expect(office).not.toHaveBeenCalled();
  });

  it("keeps what loaded when the next page fails, and tries again", async () => {
    const search = answerBatches({ fail: 2 });
    renderResults(leeds);
    fireEvent.click(await screen.findByRole("button", { name: "Load more" }));
    expect((await screen.findByRole("alert")).textContent).toContain(TOO_MANY);
    expect(cards()).toHaveLength(12);
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    await waitFor(() => expect(search.mock.calls.filter(([query]) => query.includes("page=2"))).toHaveLength(2));
  });

  it("carries keyboard focus from Load more to Try again when the next page fails", async () => {
    answerBatches({ fail: 2 });
    renderResults(leeds);
    const more = await screen.findByRole("button", { name: "Load more" });
    act(() => more.focus());
    fireEvent.click(more);
    const retry = await screen.findByRole("button", { name: "Try again" });
    expect(document.activeElement).toBe(retry);
  });

  it("keeps keyboard focus on the same button through a failed page and its retry", async () => {
    const search = answerBatches();
    renderResults(leeds);
    const more = await screen.findByRole("button", { name: "Load more" });
    search.mockRejectedValueOnce(new ApiError(429, TOO_MANY));
    act(() => more.focus());
    fireEvent.click(more);
    expect(await screen.findByRole("button", { name: "Try again" })).toBe(more);
    fireEvent.click(more);
    await screen.findByRole("heading", { name: /^24 results/ });
    expect(screen.getByRole("button", { name: "Load more" })).toBe(more);
    expect(document.activeElement).toBe(more);
  });

  it("carries keyboard focus to the first new card when a retried last page arrives", async () => {
    const search = answerBatches({ total: 24 });
    renderResults(leeds);
    const more = await screen.findByRole("button", { name: "Load more" });
    search.mockRejectedValueOnce(new ApiError(429, TOO_MANY));
    act(() => more.focus());
    fireEvent.click(more);
    fireEvent.click(await screen.findByRole("button", { name: "Try again" }));
    await screen.findByRole("heading", { name: /^24 results/ });
    expect(document.activeElement).toBe(screen.getByRole("link", { name: "Therapist 2-0" }));
  });

  it("offers UKCP's own search in a new tab when the first page fails", async () => {
    answerBatches({ fail: 1 });
    renderResults(leeds);
    const link = await screen.findByRole("link", { name: "Search on UKCP" });
    expect(link.getAttribute("href")).toContain("Location=Leeds");
    expect(link.getAttribute("target")).toBe("_blank");
  });

  it("starts again from the nearest page when the search changes", async () => {
    answerBatches();
    const { rerender } = renderResults(leeds);
    fireEvent.click(await screen.findByRole("button", { name: "Load more" }));
    await screen.findByRole("heading", { name: /^24 results/ });
    rerender(withText(emptyParams(), "Location", "York"));
    await screen.findByRole("heading", { name: /^12 results/ });
    expect(cards()).toHaveLength(12);
  });
});
