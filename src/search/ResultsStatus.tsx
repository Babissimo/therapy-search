import { useEffect, useState } from "react";
import { asksWhole, toQuery, type SearchParams } from "@shared/query";
import { useTitle } from "@/lib/useTitle";
import { cn } from "@/lib/utils";
import { therapistCount } from "@/shortlist/useShortlist";
import { activeFilters } from "./activeFilters";
import { locationFellBack } from "./LocationNotice";
import { reachWithin } from "./reach";
import type { SearchResults } from "./useResults";

// How long a search runs before the list says why.
const SLOW_MS = 2000;

type Props = {
  params: SearchParams;
  results: SearchResults;
  /** Among therapists met online or by phone, with no place to show. */
  online?: boolean;
  /** False while there is nothing yet to search for, when the region says nothing. */
  searching?: boolean;
  className?: string;
};

/**
 * A search's status region. Out of sight, it tells a screen reader what each search found, which names the page too; in
 * sight unless `className` hides it, it says why a search asked of UKCP whole (`asksWhole`) is taking a while, once it
 * has. It must sit outside anything made inert, such as the list put away over the map. Its `aria-live` keeps a modal's
 * aria-hidden off it, so ticks in the phone's filters sheet are heard, provided it is there as the modal opens.
 */
export function ResultsStatus({ params, results, online = false, searching = true, className }: Props) {
  const found = searching ? foundLines(params, results, online) : undefined;
  useTitle(found?.title);
  const slow = useSlow(searching && (results.loading || results.stale) && asksWhole(params));
  const said = useSaid(found?.said ?? "", toQuery(params));
  return (
    // Always there, since a screen reader announces changes to a region it already knows.
    <p role="status" aria-live="polite" className={cn("text-sm text-muted-foreground", !slow && "sr-only", className)}>
      {slow ? "Getting every result. The first time can take a few seconds." : said}
    </p>
  );
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

/** Whether `waiting` has lasted SLOW_MS. */
function useSlow(waiting: boolean): boolean {
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    if (!waiting) return;
    const timer = setTimeout(() => setSlow(true), SLOW_MS);
    return () => {
      clearTimeout(timer);
      setSlow(false);
    };
  }, [waiting]);
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
