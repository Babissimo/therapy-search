import { keepPreviousData, useInfiniteQuery, type InfiniteData, type QueryClient, type UseInfiniteQueryResult } from "@tanstack/react-query";
import { PAGE_SIZE, toQuery, type SearchParams } from "@shared/query";
import type { SearchResult, TherapistCard } from "@shared/types";
import type { Listings } from "@shared/ukcp/parseResults";
import { api } from "@/lib/api";
import { locationFellBack } from "./LocationNotice";
import { inOrder, orderSeed } from "./order";
import { withPage } from "./state";

// As long as results stay fresh, so Back from a profile finds every page still loaded.
const KEEP_FOR = 15 * 60 * 1000;

/** A page of results with the batch it was cut from, which the next page is cut from too while it lasts. */
type Page = SearchResult & { batch: Listings; stride: number };
/** How many results the pages so far hold, and the batch they came from. */
type After = { shown: number; batch?: Listings; stride?: number };

export type SearchResults = {
  query: UseInfiniteQueryResult<InfiniteData<Page, After>>;
  first?: SearchResult;
  therapists: TherapistCard[];
  /** The place UKCP measured distances from, unless it fell back to searching the whole UK. */
  searchedPlace?: string;
};

/**
 * A search's results in this browser's order, a page at a time for "Load more", cut from batches that are each asked
 * of UKCP once. Nothing is asked for, or shown, until `enabled`.
 */
export function useResults(params: SearchParams, enabled = true): SearchResults {
  const batchQuery = (n: number) => toQuery(withPage(params, n));
  // Spelt out because TypeScript otherwise fills in the page data's type before inferring the page parameter's.
  const query = useInfiniteQuery<Page, Error, InfiniteData<Page, After>, readonly unknown[], After>({
    queryKey: ["results", batchQuery(1)],
    queryFn: ({ pageParam }) => pageAfter(pageParam, (n) => batchInOrder(batchQuery(n))),
    initialPageParam: { shown: 0 },
    getNextPageParam: (last) => (last.therapists.length > 0 && last.to < last.total ? { shown: last.to, batch: last.batch, stride: last.stride } : undefined),
    enabled,
    // Without a search, the last one's results would linger in its place.
    placeholderData: enabled ? keepPreviousData : undefined,
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

/** The card a search still in `client`'s cache showed for this therapist, if one did. */
export function cachedCard(client: QueryClient, slug: string): TherapistCard | undefined {
  for (const [, data] of client.getQueriesData<InfiniteData<Page, After>>({ queryKey: ["results"] })) {
    const card = data?.pages.flatMap((page) => page.therapists).find((therapist) => therapist.slug === slug);
    if (card) return card;
  }
  return undefined;
}

/**
 * The page after the first `shown` results, stopping short at its batch's end. UKCP may answer fewer than asked for,
 * so the first batch's length sets the stride between batches.
 */
async function pageAfter({ shown, batch, stride }: After, fetchBatch: (n: number) => Promise<Listings>): Promise<Page> {
  if (batch === undefined || stride === undefined) {
    batch = await fetchBatch(1);
    stride = batch.total === 0 ? 0 : batch.to - batch.from + 1;
  }
  if (stride <= 0) return { ...aboutBatch(batch), therapists: batch.listings.map((listing) => listing.read()), batch, stride };
  if (shown >= batch.to) batch = await fetchBatch(Math.floor(shown / stride) + 1);
  const offset = shown - (batch.from - 1);
  const therapists = offset < 0 ? [] : batch.listings.slice(offset, offset + PAGE_SIZE).map((listing) => listing.read());
  return { ...aboutBatch(batch), from: shown + 1, to: shown + therapists.length, therapists, batch, stride };
}

/** A batch in this browser's order, in place of the shuffle UKCP gave it. */
async function batchInOrder(query: string): Promise<Listings> {
  const batch = await api.search(query);
  return { ...batch, listings: inOrder(batch.listings, orderSeed()) };
}

/** A batch's count, place and notices, without its cards. */
function aboutBatch({ listings: _, ...about }: Listings): Omit<SearchResult, "therapists"> {
  return about;
}

/** UKCP reshuffles equally distant results about once a minute, so a later batch can repeat someone; each is shown once. */
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
