// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { emptyParams } from "@shared/query";
import type { TherapistCard } from "@shared/types";
import { api } from "@/lib/api";
import { listed } from "@/lib/listed.testing";
import { inOrder, orderSeed } from "./order";
import { cachedCard, useResults } from "./useResults";

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
