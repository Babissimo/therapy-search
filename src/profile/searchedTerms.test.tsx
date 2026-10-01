// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Profile, TherapistCard } from "@shared/types";
import { api } from "@/lib/api";
import { listed } from "@/lib/listed.testing";
import { onlineSearch } from "@/search/online";
import { prefetchResults } from "@/search/useResults";
import { readSearch } from "@/search/useSearchState";
import { matchingTags, useOpeningCard, useSearchMatch } from "./searchedTerms";

describe("matchingTags", () => {
  const section = (items: string[], titles: string[] = []) => ({ heading: "", paragraphs: [], items, details: titles.map((title) => ({ title, text: "" })) });
  const profile: Profile = {
    slug: "Jo-ABCDEFGH",
    name: "Jo Bloggs",
    initials: "JB",
    languages: ["French"],
    emailInContact: false,
    social: [],
    about: [section(["Couples"], ["Anxiety"]), section(["anxiety", "Depression"])],
    practical: [section(["Online Therapy"])],
    offices: [],
  };

  it("lists each searched tag once, in the profile's order, languages last", () => {
    const searched = new Set(["anxiety", "online therapy", "couples", "french"]);
    expect(matchingTags(profile, (tag) => searched.has(tag.toLowerCase()))).toEqual(["Couples", "Anxiety", "Online Therapy", "French"]);
  });
});

describe("the search a profile was opened from", () => {
  const CARD: TherapistCard = { slug: "Jo-ABCDEFGH", name: "Jo Bloggs", initials: "JB", location: "Leeds", sessionTypes: "Remote", tags: [] };

  afterEach(() => vi.restoreAllMocks());

  // A profile opened over a view, whose search has already brought the card.
  async function openedOver(pathname: string, search: string, shown: Parameters<typeof prefetchResults>[1]) {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    vi.spyOn(api, "search").mockResolvedValue(listed({ total: 1, from: 1, to: 1, notices: [], therapists: [CARD] }));
    prefetchResults(client, shown);
    await waitFor(() => expect(client.isFetching()).toBe(0));
    const at = { pathname: `/therapist/${CARD.slug}`, state: { background: { pathname, search } } };
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={[at]}>{children}</MemoryRouter>
      </QueryClientProvider>
    );
    return renderHook(() => ({ card: useOpeningCard(CARD.slug), isMatch: useSearchMatch() }), { wrapper }).result.current;
  }

  it("finds the card a search near a place showed, and its terms", async () => {
    const { card, isMatch } = await openedOver("/", "?Location=Leeds&KeywordFilter=grief", readSearch("?Location=Leeds&KeywordFilter=grief"));
    expect(card).toEqual(CARD);
    expect(isMatch("Grief")).toBe(true);
    expect(isMatch("Online Therapy")).toBe(false);
  });

  it("finds the card the online view showed, and marks the remote sessions it searched for", async () => {
    const { card, isMatch } = await openedOver("/online", "?KeywordFilter=grief", onlineSearch(readSearch("?KeywordFilter=grief")));
    expect(card).toEqual(CARD);
    expect(isMatch("Grief")).toBe(true);
    expect(isMatch("Online Therapy")).toBe(true);
    expect(isMatch("Telephone Therapy")).toBe(true);
  });
});
