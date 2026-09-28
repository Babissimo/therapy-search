import { keepPreviousData, useInfiniteQuery, type InfiniteData, type UseInfiniteQueryResult } from "@tanstack/react-query";
import { useState } from "react";
import { toQuery, type SearchParams } from "@shared/query";
import type { SearchResult, TherapistCard } from "@shared/types";
import { api } from "@/lib/api";
import { locationFellBack } from "./LocationNotice";
import { orderSeed } from "./orderSeed";
import { withPage } from "./state";

// As long as results stay fresh, so Back from a profile finds every page still loaded.
const KEEP_FOR = 15 * 60 * 1000;

export type SearchResults = {
  query: UseInfiniteQueryResult<InfiniteData<SearchResult, number>>;
  first?: SearchResult;
  therapists: TherapistCard[];
  /** The place UKCP measured distances from, unless it fell back to searching the whole UK. */
  searchedPlace?: string;
};

/** A search's results, a page at a time in UKCP's order, for "Load more". */
export function useResults(params: SearchParams): SearchResults {
  const [seed] = useState(() => orderSeed());
  const pageQuery = (page: number) => toQuery({ ...withPage(params, page), orderSeed: seed }, { withSeed: true });
  // Spelt out because TypeScript otherwise fills in the page data's type before inferring the page number's.
  const query = useInfiniteQuery<SearchResult, Error, InfiniteData<SearchResult, number>, readonly unknown[], number>({
    queryKey: ["results", pageQuery(1)],
    queryFn: ({ pageParam }) => api.search(pageQuery(pageParam)),
    initialPageParam: 1,
    getNextPageParam: (last: SearchResult, pages: SearchResult[]) => (last.to < last.total ? pages.length + 1 : undefined),
    placeholderData: keepPreviousData,
    gcTime: KEEP_FOR,
  });
  const pages = query.data?.pages ?? [];
  const first = pages[0];
  const searched = first?.locationSearched;
  return {
    query,
    first,
    therapists: distinct(pages),
    searchedPlace: searched !== undefined && !locationFellBack(params.text.Location, searched) ? searched : undefined,
  };
}

/** Location searches carry no order seed, so UKCP may list someone on two pages; each is shown once. */
function distinct(pages: SearchResult[]): TherapistCard[] {
  const seen = new Set<string>();
  const therapists: TherapistCard[] = [];
  for (const therapist of pages.flatMap((page) => page.therapists)) {
    if (seen.has(therapist.slug)) continue;
    seen.add(therapist.slug);
    therapists.push(therapist);
  }
  return therapists;
}
