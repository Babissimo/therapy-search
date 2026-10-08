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
    expect([result.current.loading, result.current.partial, result.current.first?.total]).toEqual([false, true, 30]);
    await release();
    await waitFor(() => expect(shown(result.current.therapists)).toEqual(expectedNear.slice(0, 12)));
    expect(result.current.partial).toBe(false);
  });

  it("counts the nearest few whole when they fill the first page their batch will show", async () => {
    answerLater();
    answerEarly(24);
    const { result } = renderHook(() => useResults(near("Leeds")), { wrapper: withClient() });
    await waitFor(() => expect(shown(result.current.therapists)).toEqual(expectedNear.slice(0, 12)));
    expect(result.current.partial).toBe(false);
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

  it("keeps a failed batch's error, alone, while it is asked again, with none of the nearest few", async () => {
    const search = vi.spyOn(api, "search").mockRejectedValue(new Error("UKCP is down"));
    answerEarly(12);
    const { result } = renderHook(() => useResults(near("Leeds")), { wrapper: withClient() });
    await waitFor(() => expect(result.current.failure.error?.message).toBe("UKCP is down"));
    search.mockImplementation(() => new Promise(() => {}));
    act(() => result.current.failure.retry());
    await waitFor(() => expect(result.current.query.isFetching).toBe(true));
    const { failure, therapists, loading, stale } = result.current;
    expect([failure.error?.message, therapists, loading, stale]).toEqual(["UKCP is down", [], false, false]);
  });

  it("shows nothing of the last search while a failed one is asked again", async () => {
    answerShuffled(located);
    const { result, rerender } = renderHook((params) => useResults(params), { wrapper: withClient(), initialProps: emptyParams() });
    await waitFor(() => expect(result.current.therapists).toHaveLength(12));
    const search = vi.spyOn(api, "search").mockRejectedValue(new Error("UKCP is down"));
    rerender(near("York"));
    await waitFor(() => expect(result.current.failure.error).toBeDefined());
    search.mockImplementation(() => new Promise(() => {}));
    act(() => result.current.failure.retry());
    await waitFor(() => expect(result.current.query.isPlaceholderData).toBe(true));
    expect([result.current.failure.error?.message, result.current.therapists, result.current.stale]).toEqual(["UKCP is down", [], false]);
  });

  it("tries a failed search again when the same is asked for, and not for another", async () => {
    const search = vi.spyOn(api, "search").mockRejectedValue(new Error("UKCP is down"));
    const { result } = renderHook(() => useResults(near("Leeds")), { wrapper: withClient() });
    await waitFor(() => expect(result.current.failure.error).toBeDefined());
    search.mockImplementation(() => new Promise(() => {}));
    act(() => result.current.retrySame(near("York")));
    expect(search.mock.calls.length).toBe(1);
    act(() => result.current.retrySame(near("Leeds")));
    await waitFor(() => expect(result.current.failure.retrying).toBe(true));
    expect(search.mock.calls.length).toBe(2);
  });

  it("asks UKCP nothing more when the same search is asked for while the connection's return is already trying it again", async () => {
    const search = vi.spyOn(api, "search").mockRejectedValue(new Error("UKCP is down"));
    const { result } = renderHook(() => useResults(near("Leeds")), { wrapper: withClient() });
    await waitFor(() => expect(result.current.failure.error).toBeDefined());
    search.mockImplementation(() => new Promise(() => {}));
    act(() => void result.current.query.refetch());
    await waitFor(() => expect(result.current.failure.retrying).toBe(true));
    act(() => result.current.retrySame(near("Leeds")));
    expect(search.mock.calls.length).toBe(2);
  });

  it("asks nothing again of a search that answered, or of one that failed and is no longer asked for", async () => {
    const search = vi.spyOn(api, "search").mockResolvedValue(listingsOf(cards));
    const answered = renderHook(() => useResults(near("Leeds")), { wrapper: withClient() });
    await waitFor(() => expect(answered.result.current.therapists).toHaveLength(12));
    act(() => answered.result.current.retrySame(near("Leeds")));
    expect(search).toHaveBeenCalledOnce();
    search.mockRejectedValue(new Error("UKCP is down"));
    const client = newClient();
    const failed = renderHook((enabled) => useResults(near("York"), enabled), { wrapper: withClient(client), initialProps: true });
    await waitFor(() => expect(failed.result.current.failure.error).toBeDefined());
    failed.rerender(false);
    act(() => failed.result.current.retrySame(near("York")));
    expect(search).toHaveBeenCalledTimes(2);
  });

  it("lets a failure go once another search is asked, so going back to it loads as usual", async () => {
    const search = vi.spyOn(api, "search").mockRejectedValue(new Error("UKCP is down"));
    const { result, rerender } = renderHook((params) => useResults(params), { wrapper: withClient(), initialProps: emptyParams() });
    await waitFor(() => expect(result.current.failure.error).toBeDefined());
    search.mockResolvedValue(listingsOf(cards));
    rerender(near("York"));
    await waitFor(() => expect(result.current.therapists).toHaveLength(12));
    search.mockImplementation(() => new Promise(() => {}));
    rerender(emptyParams());
    await waitFor(() => expect(result.current.query.isFetching).toBe(true));
    expect(result.current.failure.error).toBeUndefined();
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

describe("useResults with a face-to-face type ticked", () => {
  const faceToFace = (Location = "Leeds", TypesOfSession = ["Face to Face - Long Term"]): SearchParams => {
    const empty = emptyParams();
    return { ...empty, text: { ...empty.text, Location }, multi: { ...empty.multi, TypesOfSession } };
  };
  // A tenth of a mile apart: every fourth says nothing of how they meet, and every fourth from the fourth meets only remotely.
  const around = Array.from({ length: 40 }, (_, i): TherapistCard => ({
    ...cards[i % 30]!,
    slug: `Near-${i}-ID${i}`,
    distance: `${(i + 1) / 10} miles from Leeds`,
    sessionTypes: i % 4 === 0 ? undefined : i % 4 === 3 ? "Remote" : "In-person",
  }));
  const inPerson = around.filter((card) => card.sessionTypes === "In-person");
  const listedTogether = around.filter((card) => card.sessionTypes !== "Remote").map((card) => card.slug);

  /** UKCP answering the ticked search with `ticked` and the same without its ticks with `all`, `size` at a time. */
  function answerBoth(ticked: TherapistCard[], all: TherapistCard[], { size = 1000, place = "Leeds, West Yorkshire, UK" } = {}) {
    const answer = (query: string) => {
      const asked = new URLSearchParams(query);
      const found = asked.has("TypesOfSession") ? ticked : all;
      const from = (Number(asked.get("page") ?? 1) - 1) * size;
      const sent = found.slice(from, from + size);
      return listed({ total: found.length, from: from + 1, to: from + sent.length, locationSearched: place, notices: [], therapists: sent });
    };
    return {
      search: vi.spyOn(api, "search").mockImplementation(async (query) => answer(query)),
      early: vi.spyOn(api, "searchEarly").mockImplementation(async (query) => {
        const sent = answer(query);
        return { ...sent, to: Math.min(sent.to, 12), listings: sent.listings.slice(0, 12) };
      }),
    };
  }

  /** Whether each search asked carried the ticks. */
  const ticked = (search: { mock: { calls: [string][] } }) => search.mock.calls.map(([query]) => new URLSearchParams(query).has("TypesOfSession"));

  it("lists those who don't say how they meet among the rest by distance, and no one else the search without its ticks finds", async () => {
    const { search } = answerBoth(inPerson, around);
    const { result } = renderHook(() => useResults(faceToFace()), { wrapper: withClient() });
    await waitFor(() => expect(shown(result.current.therapists)).toEqual(listedTogether.slice(0, 12)));
    expect(ticked(search).sort()).toEqual([false, true]);
  });

  it("pages through both searches' batches nearest first, asking each for its next batch only once it is needed", async () => {
    const { search } = answerBoth(inPerson, around, { size: 10 });
    const { result } = renderHook(() => useResults(faceToFace()), { wrapper: withClient() });
    await waitFor(() => expect(shown(result.current.therapists)).toEqual(listedTogether.slice(0, 12)));
    // The ticked search's first ten reach 1.9 miles and the other's 1 mile, so only the other is asked for its second.
    expect(search.mock.calls.map(([query]) => query).filter((query) => query.includes("page="))).toEqual(["Location=Leeds&page=2"]);
    while (result.current.query.hasNextPage) {
      act(() => void result.current.query.fetchNextPage());
      await waitFor(() => expect(result.current.query.isFetchingNextPage).toBe(false));
    }
    expect(shown(result.current.therapists)).toEqual(listedTogether);
  });

  it("lists the ticked search alone when UKCP didn't recognise the place, as it then measures no distances", async () => {
    const unmeasured = (list: TherapistCard[]) => list.map((card) => ({ ...card, distance: undefined }));
    answerBoth(unmeasured(inPerson), unmeasured(around), { place: "United Kingdom" });
    const { result } = renderHook(() => useResults(faceToFace("Nowhereville")), { wrapper: withClient() });
    await waitFor(() => expect(result.current.therapists).toHaveLength(12));
    expect(result.current.therapists.every((card) => card.sessionTypes === "In-person")).toBe(true);
  });

  it("shows both searches' nearest few, merged, before their batches", async () => {
    const { search } = answerBoth(inPerson, around);
    search.mockImplementation(() => new Promise(() => {}));
    const { result } = renderHook(() => useResults(faceToFace()), { wrapper: withClient() });
    // The other search's twelve reach 1.2 miles, nearer than the ticked search's, so the few end short of that.
    await waitFor(() => expect(shown(result.current.therapists)).toEqual(listedTogether.slice(0, 9)));
    expect(result.current.partial).toBe(true);
  });

  it("fails as a whole when the search without its ticks fails, to be tried again", async () => {
    const { search } = answerBoth(inPerson, around);
    const answered = search.getMockImplementation()!;
    search.mockImplementation(async (query) => (new URLSearchParams(query).has("TypesOfSession") ? answered(query) : Promise.reject(new Error("UKCP is down"))));
    const { result } = renderHook(() => useResults(faceToFace()), { wrapper: withClient() });
    await waitFor(() => expect(result.current.failure.error?.message).toBe("UKCP is down"));
    expect(result.current.therapists).toEqual([]);
    search.mockImplementation(answered);
    act(() => result.current.failure.retry());
    await waitFor(() => expect(shown(result.current.therapists)).toEqual(listedTogether.slice(0, 12)));
  });

  it("asks only the ticked search without a face-to-face tick", async () => {
    const { search } = answerBoth(inPerson, around);
    const { result } = renderHook(() => useResults(faceToFace("Leeds", ["Online Therapy"])), { wrapper: withClient() });
    await waitFor(() => expect(result.current.therapists).toHaveLength(12));
    expect(ticked(search)).toEqual([true]);
  });
});
