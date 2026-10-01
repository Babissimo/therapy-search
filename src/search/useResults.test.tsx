// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { emptyParams, type SearchParams } from "@shared/query";
import type { TherapistCard } from "@shared/types";
import { api } from "@/lib/api";
import { listed } from "@/lib/listed.testing";
import { inOrder, orderSeed } from "./order";
import { withFlag } from "./state";
import { cachedCard, shownCard, useResults } from "./useResults";

const newClient = () => new QueryClient({ defaultOptions: { queries: { retry: false } } });

function withClient(client = newClient()) {
  return ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

const cards = Array.from({ length: 30 }, (_, i): TherapistCard => ({
  slug: `Therapist-${i}-ID${i}`,
  name: `Therapist ${i}`,
  initials: "T",
  photoUrl: i % 3 === 0 ? "https://example.invalid/photo.jpg" : undefined,
  summary: i % 2 === 0 ? "Summary." : undefined,
  tags: [],
}));
const listingsOf = (answer: TherapistCard[]) => listed({ total: answer.length, from: 1, to: answer.length, notices: [], therapists: answer });

/** UKCP answering with every card at once, shuffled afresh each time as it does among people at the same distance. */
function answerShuffled(answer = cards) {
  const read = vi.fn((card: TherapistCard) => card);
  vi.spyOn(api, "search").mockImplementation(async () => {
    const found = listingsOf(answer);
    return { ...found, listings: found.listings.sort(() => Math.random() - 0.5).map((listing) => ({ ...listing, read: () => read(listing.read()) })) };
  });
  return read;
}

const shown = (therapists: TherapistCard[]) => therapists.map((t) => t.slug);
const expectedOf = (answer: TherapistCard[]) => inOrder(listingsOf(answer).listings, orderSeed()).map((l) => l.slug);
const expected = expectedOf(cards);

afterEach(() => vi.restoreAllMocks());

describe("useResults", () => {
  it("lists a search in this browser's order, the same on a later visit though UKCP has shuffled it again", async () => {
    answerShuffled();
    const first = renderHook(() => useResults(emptyParams()), { wrapper: withClient() });
    await waitFor(() => expect(shown(first.result.current.therapists)).toEqual(expected.slice(0, 12)));
    const later = renderHook(() => useResults(emptyParams()), { wrapper: withClient() });
    await waitFor(() => expect(shown(later.result.current.therapists)).toEqual(expected.slice(0, 12)));
  });

  it("reads only the cards it shows, after putting them in order", async () => {
    const read = answerShuffled();
    const { result } = renderHook(() => useResults(emptyParams()), { wrapper: withClient() });
    await waitFor(() => expect(result.current.therapists).toHaveLength(12));
    expect(read.mock.calls.map(([card]) => card.slug)).toEqual(expected.slice(0, 12));
    act(() => void result.current.query.fetchNextPage());
    await waitFor(() => expect(shown(result.current.therapists)).toEqual(expected.slice(0, 24)));
    expect(read).toHaveBeenCalledTimes(24);
  });

  it("keeps a location search nearest first, in this browser's order among people at the same distance", async () => {
    const located = cards.map((card, i) => ({ ...card, distance: `${i < 6 ? 0.4 : 0.2} miles from Leeds` }));
    answerShuffled(located);
    const { result } = renderHook(() => useResults(emptyParams()), { wrapper: withClient() });
    await waitFor(() => expect(result.current.therapists).toHaveLength(12));
    expect(shown(result.current.therapists)).toEqual(expectedOf(located.slice(6)).slice(0, 12));
  });

  it("finds the card a search showed for a therapist, but not one of those it has yet to show", async () => {
    answerShuffled();
    const client = newClient();
    const { result } = renderHook(() => useResults(emptyParams()), { wrapper: withClient(client) });
    await waitFor(() => expect(result.current.therapists).toHaveLength(12));
    const [first] = result.current.therapists;
    expect(cachedCard(client, first!.slug)).toBe(first);
    expect(cachedCard(client, expected[12]!)).toBeUndefined();
  });
});

describe("useResults with only photos", () => {
  const photosOnly = (params: SearchParams) => withFlag(params, "OnlyProfilesWithPhotos", true);
  // Twenty of the thirty show a photo, more than a page.
  const photographed = cards.map((card, i) => ({ ...card, photoUrl: i % 3 === 2 ? undefined : "https://example.invalid/photo.jpg" }));
  const withPhoto = new Set(photographed.filter((card) => card.photoUrl).map((card) => card.slug));

  it("cuts its results from the same search's, loaded whole, in their order and counted afresh", async () => {
    answerShuffled(photographed);
    const client = newClient();
    const all = renderHook(() => useResults(emptyParams()), { wrapper: withClient(client) });
    await waitFor(() => expect(all.result.current.therapists).toHaveLength(12));
    const { result } = renderHook(() => useResults(photosOnly(emptyParams())), { wrapper: withClient(client) });
    await waitFor(() => expect(result.current.query.isSuccess).toBe(true));
    act(() => void result.current.query.fetchNextPage());
    await waitFor(() => expect(result.current.therapists).toHaveLength(20));
    expect(shown(result.current.therapists)).toEqual(expectedOf(photographed).filter((slug) => withPhoto.has(slug)));
    expect(result.current.first?.total).toBe(20);
    expect(api.search).toHaveBeenCalledTimes(1);
  });

  it("asks UKCP with the flag when the same search without it is not loaded", async () => {
    answerShuffled(photographed);
    const { result } = renderHook(() => useResults(photosOnly(emptyParams())), { wrapper: withClient() });
    await waitFor(() => expect(result.current.query.isSuccess).toBe(true));
    expect(api.search).toHaveBeenCalledWith(expect.stringContaining("OnlyProfilesWithPhotos=true"));
  });

  it("asks UKCP with the flag when no one in the same search, loaded whole, shows a photo", async () => {
    answerShuffled(cards.map((card) => ({ ...card, photoUrl: undefined })));
    const client = newClient();
    const all = renderHook(() => useResults(emptyParams()), { wrapper: withClient(client) });
    await waitFor(() => expect(all.result.current.therapists).toHaveLength(12));
    const { result } = renderHook(() => useResults(photosOnly(emptyParams())), { wrapper: withClient(client) });
    await waitFor(() => expect(result.current.query.isSuccess).toBe(true));
    expect(api.search).toHaveBeenCalledTimes(2);
    expect(api.search).toHaveBeenLastCalledWith(expect.stringContaining("OnlyProfilesWithPhotos=true"));
  });

  it("asks UKCP with the flag when the same search without it has more than its first batch", async () => {
    vi.spyOn(api, "search").mockImplementation(async () => ({ ...listingsOf(photographed), total: 600 }));
    const client = newClient();
    const all = renderHook(() => useResults(emptyParams()), { wrapper: withClient(client) });
    await waitFor(() => expect(all.result.current.query.isSuccess).toBe(true));
    const { result } = renderHook(() => useResults(photosOnly(emptyParams())), { wrapper: withClient(client) });
    await waitFor(() => expect(result.current.query.isSuccess).toBe(true));
    expect(api.search).toHaveBeenCalledTimes(2);
    expect(api.search).toHaveBeenLastCalledWith(expect.stringContaining("OnlyProfilesWithPhotos=true"));
  });
});

describe("useResults near a place", () => {
  const near = (Location: string) => ({ ...emptyParams(), text: { ...emptyParams().text, Location } });
  // Five people at each tenth of a mile.
  const located = cards.map((card, i) => ({ ...card, distance: `${(Math.floor(i / 5) + 1) / 10} miles from Leeds` }));
  const expectedNear = expectedOf(located);

  /** UKCP answering the batch once `release` is called. */
  function answerLater(answer = located) {
    let release!: () => void;
    const released = new Promise<void>((resolve) => (release = resolve));
    const search = vi.spyOn(api, "search").mockImplementation(async () => {
      await released;
      return listingsOf(answer);
    });
    return { search, release: () => act(release) };
  }

  /** UKCP answering with the nearest `count`, nearest first but in another order among people at one distance. */
  function answerEarly(count: number, answer = located) {
    return vi.spyOn(api, "searchEarly").mockImplementation(async () => {
      const nearest = inOrder(listingsOf(answer).listings, 99).slice(0, count);
      return { total: answer.length, from: 1, to: nearest.length, notices: [], listings: nearest };
    });
  }

  it("shows the nearest few before the batch, only those the batch lists first, then its first page beyond them", async () => {
    const { release } = answerLater();
    answerEarly(12);
    const { result } = renderHook(() => useResults(near("Leeds")), { wrapper: withClient() });
    // The twelve sent reach 0.3 miles, where three more are still to come.
    await waitFor(() => expect(shown(result.current.therapists)).toEqual(expectedNear.slice(0, 10)));
    expect([result.current.loading, result.current.first?.total]).toEqual([false, 30]);
    await release();
    await waitFor(() => expect(shown(result.current.therapists)).toEqual(expectedNear.slice(0, 12)));
  });

  it("waits for the batch while the nearest few all share one distance", async () => {
    const together = cards.map((card) => ({ ...card, distance: "0.4 miles from Leeds" }));
    const { release } = answerLater(together);
    const early = answerEarly(12, together);
    const { result } = renderHook(() => useResults(near("Leeds")), { wrapper: withClient() });
    await waitFor(() => expect(early).toHaveBeenCalled());
    await act(() => early.mock.results[0]?.value);
    expect([result.current.loading, result.current.therapists]).toEqual([true, []]);
    await release();
    await waitFor(() => expect(shown(result.current.therapists)).toEqual(expectedOf(together).slice(0, 12)));
  });

  it("puts a new search's nearest few in place of the last search's results", async () => {
    answerShuffled(located);
    answerEarly(12);
    const { result, rerender } = renderHook((params) => useResults(params), { wrapper: withClient(), initialProps: near("Leeds") });
    await waitFor(() => expect(result.current.therapists).toHaveLength(12));
    answerLater();
    rerender(near("York"));
    expect(result.current.stale).toBe(true);
    await waitFor(() => expect(result.current.stale).toBe(false));
    expect(shown(result.current.therapists)).toEqual(expectedNear.slice(0, 10));
  });

  it("drops the nearest few when the batch fails, leaving its error", async () => {
    vi.spyOn(api, "search").mockRejectedValue(new Error("UKCP is down"));
    answerEarly(12);
    const { result } = renderHook(() => useResults(near("Leeds")), { wrapper: withClient() });
    await waitFor(() => expect(result.current.query.isLoadingError).toBe(true));
    expect([result.current.loading, result.current.therapists]).toEqual([false, []]);
  });

  it("shows the batch alone when the nearest few fail", async () => {
    answerShuffled(located);
    vi.spyOn(api, "searchEarly").mockRejectedValue(new Error("Too many searches"));
    const { result } = renderHook(() => useResults(near("Leeds")), { wrapper: withClient() });
    await waitFor(() => expect(shown(result.current.therapists)).toEqual(expectedNear.slice(0, 12)));
  });

  it("asks for no nearest few without a place, nor for a search whose batch it has", async () => {
    answerShuffled(located);
    const early = answerEarly(12);
    const client = newClient();
    const online = renderHook(() => useResults(emptyParams()), { wrapper: withClient(client) });
    await waitFor(() => expect(online.result.current.therapists).toHaveLength(12));
    expect(early).not.toHaveBeenCalled();
    const first = renderHook(() => useResults(near("Leeds")), { wrapper: withClient(client) });
    await waitFor(() => expect(first.result.current.query.isSuccess).toBe(true));
    renderHook(() => useResults(near("Leeds")), { wrapper: withClient(client) });
    expect(early).toHaveBeenCalledTimes(1);
  });

  it("asks for nothing, nor the nearest few, for only photos when the same search is loaded whole", async () => {
    answerShuffled(located);
    const early = answerEarly(12);
    const client = newClient();
    const all = renderHook(() => useResults(near("Leeds")), { wrapper: withClient(client) });
    await waitFor(() => expect(all.result.current.query.isSuccess).toBe(true));
    const { result } = renderHook(() => useResults(withFlag(near("Leeds"), "OnlyProfilesWithPhotos", true)), { wrapper: withClient(client) });
    await waitFor(() => expect(result.current.query.isSuccess).toBe(true));
    const withPhoto = new Set(located.filter((card) => card.photoUrl).map((card) => card.slug));
    expect(shown(result.current.therapists)).toEqual(expectedNear.filter((slug) => withPhoto.has(slug)));
    expect(api.search).toHaveBeenCalledTimes(1);
    expect(early).toHaveBeenCalledTimes(1);
  });

  it("finds the card of one of the nearest few shown before the batch", async () => {
    answerLater();
    answerEarly(12);
    const client = newClient();
    const { result } = renderHook(() => useResults(near("Leeds")), { wrapper: withClient(client) });
    await waitFor(() => expect(result.current.therapists).toHaveLength(10));
    const [first] = result.current.therapists;
    expect(cachedCard(client, first!.slug)).toBe(first);
    expect(shownCard(client, near("Leeds"), first!.slug)).toBe(first);
  });
});
