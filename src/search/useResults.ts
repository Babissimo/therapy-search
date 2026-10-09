import {
  infiniteQueryOptions,
  keepPreviousData,
  queryOptions,
  useInfiniteQuery,
  useQuery,
  useQueryClient,
  type InfiniteData,
  type QueryClient,
  type UseInfiniteQueryResult,
} from "@tanstack/react-query";
import { locationFellBack, measuredNear } from "@shared/location";
import { batchFrom, moreIn, ready, streamsFrom, takeMerged, type Stream } from "@shared/merge";
import { asksWhole, PAGE_SIZE, toQuery, type SearchParams } from "@shared/query";
import { asksUnsaid, saysNothing, withoutSessions } from "@shared/sessions";
import type { SearchResult, TherapistCard } from "@shared/types";
import type { Listing, Listings } from "@shared/ukcp/parseResults";
import { useFailure, type Failure } from "@/components/FailedAlert";
import { api } from "@/lib/api";
import { FRESH_FOR } from "@/lib/queryClient";
import { inOrder, orderSeed, settled } from "./order";
import { withFlag, withPage } from "./state";

/**
 * A page of results with the batch it was cut from, which the next page is cut from too while it lasts, or, for two
 * searches listed as one, what remains of them.
 */
type Page = SearchResult & { batch?: Listings; stride?: number; merged?: Merged };
/** How many results the pages so far hold, and the batch they came from or the searches they are merged from. */
type After = { shown: number; batch?: Listings; stride?: number; merged?: Merged };
/** A search and the same without its session types, listed as one: what remains of each, and the ticked search's place and notices. */
type Merged = { streams: Stream<Listing>[]; about: Omit<SearchResult, "therapists"> };

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
  /** True while the nearest few fall short of the first page their batch will show, which counts more and reaches further. */
  partial: boolean;
  /** True once the whole list is in, with nothing more to load: its last page has answered, or the nearest few found no one. */
  complete: boolean;
  /** The first batch's failure, which shows alone, with nothing else of the search, until it is asked again and answers. */
  failure: Failure;
  /** Tries the search again, as Try again does, if it failed and `next` asks UKCP the same; one that answered stays as it is. */
  retrySame: (next: SearchParams) => void;
};

/**
 * A search's results in this browser's order, a page at a time for "Load more", cut from batches that are each asked
 * of UKCP once. Near a place, the nearest few are asked for beside the first batch and show until it arrives, those of
 * them it will list first. Nothing is asked for, or shown, until `enabled`.
 */
export function useResults(params: SearchParams, enabled = true): SearchResults {
  const client = useQueryClient();
  const query = useInfiniteQuery({
    ...resultsQuery(params),
    enabled,
    // Without a search, the last one's results would linger in its place.
    placeholderData: enabled ? keepPreviousData : undefined,
  });
  const key = toQuery(params);
  const failure = useFailure(query, key);
  const failed = failure.error !== undefined;
  const arrived = query.data !== undefined && !query.isPlaceholderData;
  // A first batch cut from results already loaded comes before the nearest few could.
  const asksEarly = enabled && !asksWhole(params) && photosFromLoaded(client, params) === undefined;
  const early = useQuery({ ...earlyQuery(params), enabled: asksEarly && !arrived }).data;
  const showsEarly = asksEarly && !arrived && !failed && early !== undefined && (early.therapists.length > 0 || early.total === 0);
  const pages = failed ? [] : showsEarly ? [early] : (query.data?.pages ?? []);
  const first = pages[0];
  const searched = first?.locationSearched;
  return {
    query,
    first,
    therapists: distinct(pages),
    searchedPlace: searched !== undefined && !locationFellBack(params.text.Location, searched) ? searched : undefined,
    loading: query.isPending && !showsEarly && !failed,
    stale: query.isPlaceholderData && !showsEarly && !failed,
    partial: showsEarly && early.therapists.length < Math.min(PAGE_SIZE, early.total),
    // The nearest few may be all there are, but their batch may yet order them otherwise.
    complete: !failed && (showsEarly ? early.total === 0 : arrived && !query.hasNextPage),
    failure,
    retrySame: (next) => {
      if (enabled && toQuery(next) === key) failure.retry();
    },
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
      const [nearest, unticked] = await Promise.all([
        api.searchEarly(query),
        asksUnsaid(params) ? api.searchEarly(toQuery(withPage(withoutSessions(params), 1))) : undefined,
      ]);
      if (unticked === undefined || !measuredNear(nearest.locationSearched)) {
        const therapists = settled(nearest.listings, nearest.to >= nearest.total, orderSeed())
          .slice(0, PAGE_SIZE)
          .map((listing) => listing.read());
        return { ...aboutBatch(nearest), from: 1, to: therapists.length, therapists };
      }
      const streams = streamsFrom([batchFrom(nearest), batchFrom(unticked, saysNothing)]);
      const listed = ready(streams, orderSeed());
      const therapists = listed.slice(0, PAGE_SIZE).map((listing) => listing.read());
      // Until both are loaded whole, more are to come than the first page shows.
      const total = streams.some((stream) => stream.reach < Infinity) ? nearest.total + unticked.total : listed.length;
      return { ...aboutBatch(nearest), notices: noticesOf(nearest, unticked, therapists), from: 1, to: therapists.length, total, therapists };
    },
    gcTime: FRESH_FOR,
  });
}

function resultsQuery(params: SearchParams) {
  const batchQuery = (n: number) => toQuery(withPage(params, n));
  // Spelt out because TypeScript otherwise fills in the page data's type before inferring the page parameter's.
  return infiniteQueryOptions<Page, Error, InfiniteData<Page, After>, readonly unknown[], After>({
    queryKey: resultsKey(params),
    queryFn: ({ pageParam, client }) => {
      if (pageParam.merged) return mergedPage(params, pageParam.shown, pageParam.merged);
      if (pageParam.shown === 0 && asksUnsaid(params)) return firstMergedPage(params);
      return pageAfter(pageParam, async (n) => (n === 1 ? photosFromLoaded(client, params) : undefined) ?? batchInOrder(batchQuery(n)));
    },
    initialPageParam: { shown: 0 },
    getNextPageParam: (last) => {
      if (last.merged) return moreIn(last.merged.streams) ? { shown: last.to, merged: last.merged } : undefined;
      return last.therapists.length > 0 && last.to < last.total ? { shown: last.to, batch: last.batch, stride: last.stride } : undefined;
    },
    // As long as results stay fresh, so Back from a profile finds every page still loaded.
    gcTime: FRESH_FOR,
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

/**
 * A face-to-face search's first page, listing among its results those the same search without its session types finds
 * who list none, unless UKCP measured no distances to list them by. Both are asked at once, as the place is nearly always
 * one UKCP measures from.
 */
async function firstMergedPage(params: SearchParams): Promise<Page> {
  const [ticked, unticked] = await Promise.all([api.search(toQuery(withPage(params, 1))), api.search(toQuery(withPage(withoutSessions(params), 1)))]);
  if (!measuredNear(ticked.locationSearched)) {
    return pageAfter({ shown: 0 }, async (n) => (n === 1 ? inBrowserOrder(ticked) : batchInOrder(toQuery(withPage(params, n)))));
  }
  const streams = streamsFrom([batchFrom(ticked), batchFrom(unticked, saysNothing)]);
  const page = await mergedPage(params, 0, { streams, about: aboutBatch(ticked) });
  return { ...page, notices: noticesOf(ticked, unticked, page.therapists) };
}

/** The page after the first `shown` of a search and the same without its session types, listed as one. */
async function mergedPage(params: SearchParams, shown: number, { streams, about }: Merged): Promise<Page> {
  const searches = [params, withoutSessions(params)];
  const { taken, streams: rest } = await takeMerged(streams, PAGE_SIZE, orderSeed(), async (i, n) => {
    const batch = await api.search(toQuery(withPage(searches[i]!, n)));
    return i === 0 ? batchFrom(batch) : batchFrom(batch, saysNothing);
  });
  const therapists = taken.map((listing) => listing.read());
  const to = shown + therapists.length;
  // Each search's count is its own, and the list's is known only once both are loaded, so this counts those loaded: a
  // floor under it, which says whether there are any.
  const total = to + rest.reduce((waiting, stream) => waiting + stream.waiting.length, 0);
  return { ...about, from: shown + 1, to, total, therapists, merged: { streams: rest, about } };
}

/**
 * UKCP's notices for a merged list: the ticked search's, unless it found no one and the list holds those who list no
 * session types, when its advice on finding no one would be wrong.
 */
function noticesOf(ticked: Listings, unticked: Listings, listed: TherapistCard[]): string[] {
  return ticked.total === 0 && listed.length > 0 ? unticked.notices : ticked.notices;
}

/** A batch in this browser's order, in place of the shuffle UKCP gave it. */
async function batchInOrder(query: string): Promise<Listings> {
  return inBrowserOrder(await api.search(query));
}

function inBrowserOrder(batch: Listings): Listings {
  return { ...batch, listings: inOrder(batch.listings, orderSeed()) };
}

/**
 * A photos-only search's first batch, cut from the same search without the flag when that is loaded with every result
 * in its first batch. UKCP's flag keeps exactly the cards that show a photo, so asking it again would bring nothing new.
 */
function photosFromLoaded(client: QueryClient, params: SearchParams): Listings | undefined {
  if (!params.flags.OnlyProfilesWithPhotos) return undefined;
  const loaded = client.getQueryData<InfiniteData<Page, After>>(resultsKey(withFlag(params, "OnlyProfilesWithPhotos", false)))?.pages[0]?.batch;
  if (loaded === undefined || (loaded.total > 0 && (loaded.from !== 1 || loaded.to < loaded.total))) return undefined;
  // A batch in order stays in order with cards taken out.
  const listings = loaded.listings.filter((listing) => listing.hasPhoto);
  // With none left, UKCP's own empty answer brings its advice, which the loaded batch's notices lack.
  if (listings.length === 0 && loaded.total > 0) return undefined;
  return { ...loaded, total: listings.length, from: listings.length > 0 ? 1 : 0, to: listings.length, listings };
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
