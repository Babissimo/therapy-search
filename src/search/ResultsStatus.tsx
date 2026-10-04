import { useEffect, useState } from "react";
import { locationFellBack } from "@shared/location";
import { asksWhole, toQuery, type SearchParams } from "@shared/query";
import type { Failure } from "@/components/FailedAlert";
import { useTitle } from "@/lib/useTitle";
import { therapistCount } from "@/shortlist/useShortlist";
import { activeFilters } from "./activeFilters";
import { reachWithin } from "./reach";
import type { SearchResults } from "./useResults";

// How long a search runs before the list says why. A whole list is slower, and says so sooner.
const SLOW_MS = 5000;
const SLOW_WHOLE_MS = 2000;

type Props = {
  params: SearchParams;
  results: SearchResults;
  /** Among therapists met online or by phone, with no place to show. */
  online?: boolean;
  /** False while there is nothing yet to search for, when the region says nothing. */
  searching?: boolean;
};

/**
 * A search's status region, out of sight, which tells a screen reader what each search found, as it names the page, why
 * one is taking a while, and why one failed, which the list's alert leaves to it. It must sit outside anything made inert,
 * such as the list put away over the map. Its `aria-live` keeps a modal's aria-hidden off it, so ticks in the phone's
 * filters sheet are heard, provided it is there as the modal opens.
 */
export function ResultsStatus({ params, results, online = false, searching = true }: Props) {
  const found = searching ? foundLines(params, results, online) : undefined;
  useTitle(found?.title);
  const slow = useSlowLine(params, results, searching);
  const said = useSaid(failedLine(results.failure) ?? found?.said ?? "", toQuery(params));
  return (
    // Always there, since a screen reader announces changes to a region it already knows.
    <p role="status" aria-live="polite" className="sr-only">
      {slow ?? said}
    </p>
  );
}

/** Why a search is taking a while, once it has, for the list to show and the status region to say. */
export function useSlowLine(params: SearchParams, { loading, stale }: SearchResults, searching = true): string | undefined {
  const whole = asksWhole(params);
  const slow = useSlow(searching && (loading || stale), whole ? SLOW_WHOLE_MS : SLOW_MS);
  if (!slow) return undefined;
  return whole ? "Getting every result. The first time can take a few seconds." : "Still waiting for UKCP. A slow connection can take a while.";
}

/** What a search found once its results are in, as the page's title names it and a screen reader is told it. */
function foundLines(params: SearchParams, { first, therapists, searchedPlace, loading, stale }: SearchResults, online: boolean) {
  if (loading || stale || first === undefined) return undefined;
  const typed = params.text.Location.trim();
  const fellBack = locationFellBack(typed, first.locationSearched);
  // UKCP names the place in full, such as "Brighton, Brighton and Hove, UK".
  const place = searchedPlace?.split(",")[0] || typed;
  // A search near a place counts, as the list's heading does, those loaded and how far out they reach.
  const near = searchedPlace !== undefined && first.total > 0;
  const within = near ? reachWithin(therapists) : undefined;
  const count = near ? therapists.length : first.total;
  const where = online ? " working online or by phone" : fellBack ? " across the UK" : within ? ` ${within} of ${place}` : place ? ` near ${place}` : "";
  const title = `${count === 0 ? "No therapists" : therapistCount(count)}${where}`;
  if (first.total === 0) return { title, said: activeFilters(params).length > 0 ? `${title}. Remove a filter to see more.` : `${title}.` };
  return { title, said: fellBack ? `${title}. UKCP didn't recognise "${typed}".` : `${title}.` };
}

/** Why a search failed, or, while it is asked again, that it is being tried again. */
function failedLine({ error, retrying }: Failure): string | undefined {
  if (!error) return undefined;
  return retrying ? "Trying again" : error.message;
}

/** Whether `waiting` has lasted `ms`. */
function useSlow(waiting: boolean, ms: number): boolean {
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    if (!waiting) return;
    const timer = setTimeout(() => setSlow(true), ms);
    return () => {
      clearTimeout(timer);
      setSlow(false);
    };
  }, [waiting, ms]);
  return waiting && slow;
}

/**
 * `found`, a render after each `search` brings it, so a region that mounts on results already in announces them too. A
 * search found in the cache, saying just what the last one said, gains a trailing space so that it is announced as well.
 */
function useSaid(found: string, search: string): string {
  const [said, setSaid] = useState("");
  useEffect(() => {
    setSaid((was) => (found !== "" && was === found ? `${found} ` : found));
  }, [found, search]);
  return said;
}
