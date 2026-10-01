import { useEffect, useState } from "react";
import { asksWhole, toQuery, type SearchParams } from "@shared/query";
import { useTitle } from "@/lib/useTitle";
import { therapistCount } from "@/shortlist/useShortlist";
import { activeFilters } from "./activeFilters";
import { locationFellBack } from "./LocationNotice";
import type { SearchResults } from "./useResults";

// How long a search runs before the list says why. A whole list is slower, and says so sooner.
const SLOW_MS = 5000;
const SLOW_WHOLE_MS = 2000;

type Props = {
  params: SearchParams;
  results: SearchResults;
  /** Among therapists met online or by phone, with no place to show. */
  online?: boolean;
};

/**
 * A search's status region, out of sight, which tells a screen reader what each search found, as it names the page, and
 * why one is taking a while. It must sit outside anything made inert, such as the list put away over the map. Its
 * `aria-live` keeps a modal's aria-hidden off it, so ticks in the phone's filters sheet are heard.
 */
export function ResultsStatus({ params, results, online = false }: Props) {
  const found = foundLines(params, results, online);
  useTitle(found?.title);
  const slow = useSlowLine(params, results);
  const said = useSaid(found?.said ?? "", toQuery(params));
  return (
    // Always there, since a screen reader announces changes to a region it already knows.
    <p role="status" aria-live="polite" className="sr-only">
      {slow ?? said}
    </p>
  );
}

/** Why a search is taking a while, once it has, for the list to show and the status region to say. */
export function useSlowLine(params: SearchParams, { query }: SearchResults): string | undefined {
  const whole = asksWhole(params);
  const slow = useSlow(query.isPending || query.isPlaceholderData, whole ? SLOW_WHOLE_MS : SLOW_MS);
  if (!slow) return undefined;
  return whole ? "Getting every result. The first time can take a few seconds." : "Still waiting for UKCP. A slow connection can take a while.";
}

/** What a search found once its results are in, as the page's title names it and a screen reader is told it. */
function foundLines(params: SearchParams, { query, first, searchedPlace }: SearchResults, online: boolean) {
  if (query.isPending || query.isPlaceholderData || first === undefined) return undefined;
  const typed = params.text.Location.trim();
  const fellBack = locationFellBack(typed, first.locationSearched);
  // UKCP names the place in full, such as "Brighton, Brighton and Hove, UK".
  const place = searchedPlace?.split(",")[0] || typed;
  const where = online ? " working online or by phone" : fellBack ? " across the UK" : place ? ` near ${place}` : "";
  const title = `${first.total === 0 ? "No therapists" : therapistCount(first.total)}${where}`;
  if (first.total === 0) return { title, said: activeFilters(params).length > 0 ? `${title}. Remove a filter to see more.` : `${title}.` };
  return { title, said: fellBack ? `${title}. UKCP didn't recognise "${typed}".` : `${title}.` };
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
