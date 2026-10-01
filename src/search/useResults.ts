import {
  infiniteQueryOptions,
  keepPreviousData,
  queryOptions,
  useInfiniteQuery,
  useQuery,
  type InfiniteData,
  type QueryClient,
  type UseInfiniteQueryResult,
} from "@tanstack/react-query";
import { asksWhole, PAGE_SIZE, toQuery, type SearchParams } from "@shared/query";
import type { SearchResult, TherapistCard } from "@shared/types";
import type { Listings } from "@shared/ukcp/parseResults";
import { api } from "@/lib/api";
import { locationFellBack } from "./LocationNotice";
import { inOrder, orderSeed, settled } from "./order";
import { withPage } from "./state";

// As long as results stay fresh, so Back from a profile finds every page still loaded.
const KEEP_FOR = 15 * 60 * 1000;

/** A page of results with the batch it was cut from, which the next page is cut from too while it lasts. */
type Page = SearchResult & { batch: Listings; stride: number };
/** How many results the pages so far hold, and the batch they came from. */
type After = { shown: number; batch?: Listings; stride?: number };

export type SearchResults = {
  /**
   * The pages of batches, for "Load more". Until the first batch is in, the cards may be the nearest few, which its
   * `isPending` and `isPlaceholderData` know nothing of: whether there is anything to show is `loading` and `stale`.
   */
  query: UseInfiniteQueryResult<InfiniteData<Page, After>>;
  first?: SearchResult;
  therapists: TherapistCard[];
  /** The place UKCP measured distances from, unless it fell back to searching the whole UK. */
  searchedPlace?: string;
  /** True until there is something of this search to show. */
  loading: boolean;
  /** True while the last search's results show in place of this one's. */
  stale: boolean;
};

/**
 * A search's results in this browser's order, a page at a time for "Load more", cut from batches that are each asked
 * of UKCP once. Near a place, the nearest few are asked for beside the first batch and show until it arrives, those of
 * them it will list first. Nothing is asked for, or shown, until `enabled`.
 */
export function useResults(params: SearchParams, enabled = true): SearchResults {
  const query = useInfiniteQuery({
    ...resultsQuery(params),
    enabled,
    // Without a search, the last one's results would linger in its place.
    placeholderData: enabled ? keepPreviousData : undefined,
  });
  const arrived = query.data !== undefined && !query.isPlaceholderData;
  const asksEarly = enabled && !asksWhole(params);
  const early = useQuery({ ...earlyQuery(params), enabled: asksEarly && !arrived }).data;
  // A failed batch is the search's failure, which shows alone.
  const showsEarly = asksEarly && !arrived && !query.isError && early !== undefined && (early.therapists.length > 0 || early.total === 0);
  const pages = showsEarly ? [early] : (query.data?.pages ?? []);
  const first = pages[0];
  const searched = first?.locationSearched;
  return {
    query,
    first,
    therapists: distinct(pages),
    searchedPlace: searched !== undefined && !locationFellBack(params.text.Location, searched) ? searched : undefined,
    loading: query.isPending && !showsEarly,
    stale: query.isPlaceholderData && !showsEarly,
  };
}

/** Asks for a search's first page ahead of the page that shows it, which then finds it on its way or already here. */
export function prefetchResults(client: QueryClient, params: SearchParams): void {
  if (!asksWhole(params) && client.getQueryData(resultsKey(params)) === undefined) void client.prefetchQuery(earlyQuery(params));
  void client.prefetchInfiniteQuery(resultsQuery(params));
}

/** A location search's nearest few, those its first batch will list first, as its first page will show them. */
function earlyQuery(params: SearchParams) {
  const query = toQuery(withPage(params, 1));
  return queryOptions({
    queryKey: earlyKey(params),
    queryFn: async (): Promise<SearchResult> => {
      const nearest = await api.searchEarly(query);
      const therapists = settled(nearest.listings, nearest.to >= nearest.total, orderSeed())
        .slice(0, PAGE_SIZE)
        .map((listing) => listing.read());
      return { ...aboutBatch(nearest), from: 1, to: therapists.length, therapists };
    },
    gcTime: KEEP_FOR,
  });
}

function resultsQuery(params: SearchParams) {
  const batchQuery = (n: number) => toQuery(withPage(params, n));
  // Spelt out because TypeScript otherwise fills in the page data's type before inferring the page parameter's.
  return infiniteQueryOptions<Page, Error, InfiniteData<Page, After>, readonly unknown[], After>({
    queryKey: resultsKey(params),
    queryFn: ({ pageParam }) => pageAfter(pageParam, (n) => batchInOrder(batchQuery(n))),
    initialPageParam: { shown: 0 },
    getNextPageParam: (last) => (last.therapists.length > 0 && last.to < last.total ? { shown: last.to, batch: last.batch, stride: last.stride } : undefined),
    gcTime: KEEP_FOR,
  });
}

/** The card a search still in `client`'s cache showed for this therapist, if one did. */
export function cachedCard(client: QueryClient, slug: string): TherapistCard | undefined {
  const cached = [...client.getQueriesData<Cached>({ queryKey: ["results"] }), ...client.getQueriesData<Cached>({ queryKey: ["early-results"] })];
  for (const [, data] of cached) {
    const card = cardIn(data, slug);
    if (card) return card;
  }
  return undefined;
}

/** The card this search showed for this therapist, while its results are in `client`'s cache. */
export function shownCard(client: QueryClient, params: SearchParams, slug: string): TherapistCard | undefined {
  return cardIn(client.getQueryData<Cached>(resultsKey(params)), slug) ?? cardIn(client.getQueryData<Cached>(earlyKey(params)), slug);
}

/** A search's pages, or its nearest few, as kept in the cache. */
type Cached = InfiniteData<Page, After> | SearchResult;

function cardIn(data: Cached | undefined, slug: string): TherapistCard | undefined {
  const pages = data === undefined ? [] : "pages" in data ? data.pages : [data];
  return pages.flatMap((page) => page.therapists).find((therapist) => therapist.slug === slug);
}

function resultsKey(params: SearchParams) {
  return ["results", toQuery(withPage(params, 1))];
}

function earlyKey(params: SearchParams) {
  return ["early-results", toQuery(withPage(params, 1))];
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
