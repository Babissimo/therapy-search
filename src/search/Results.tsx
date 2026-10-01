import { MapPin } from "lucide-react";
import { useEffect, useId, useState, type ReactNode, type Ref } from "react";
import { asksWhole, type SearchParams } from "@shared/query";
import type { TherapistCard as Therapist } from "@shared/types";
import { SkeletonText } from "@/components/SkeletonText";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { cn } from "@/lib/utils";
import { ShortlistButton } from "@/shortlist/ShortlistButton";
import { soughtTerms } from "./activeFilters";
import { feeText } from "./fee";
import { LocationNotice } from "./LocationNotice";
import { listEntries, pinLabel, type Pin } from "./map/pins";
import { resultsHeading } from "./reach";
import { ResultsError } from "./ResultsError";
import { TherapistCard, TherapistCardSkeleton } from "./TherapistCard";
import { useOffices } from "./useOffices";
import type { SearchResults } from "./useResults";

type Props = {
  params: SearchParams;
  results: SearchResults;
  /** The list of cards, for "Load more" to hand the keyboard on to. */
  listRef?: Ref<HTMLUListElement>;
  pins?: Pin[];
  unplaced?: Therapist[];
  /** The pin last activated on the map, whose place in the list is marked. */
  selected?: Pin;
  /** The therapist whose card the pointer or focus is on, for the map to ring their pin. */
  onHighlight?: (slug: string | undefined) => void;
  /** Among therapists met online or by phone, with no place to show. */
  online?: boolean;
};

// How long a search runs before the list says why.
const SLOW_MS = 2000;

// UKCP's notices about its own pages, which don't hold for this list: that it lists a location search at random, when
// this list is nearest first, and that a search without a place finds more than 24, when Load more reaches them all.
const UKCP_PAGING = /^(Location searches are grouped by distance|This search returns more than \d+ results)/;

export function Results(props: Props) {
  const { loading, stale } = props.results;
  // Outside the list, which is marked busy and dimmed while it loads, so the line is announced and read as it comes.
  return (
    <div className="space-y-4">
      <SlowNote loading={loading || stale} whole={asksWhole(props.params)} />
      <ResultsList {...props} />
    </div>
  );
}

function ResultsList({ params, results, listRef, pins = [], unplaced = [], selected, onHighlight, online = false }: Props) {
  const { query, first, therapists, searchedPlace, loading, stale } = results;
  const { officeOf } = useOffices(therapists, !params.flags.LocationSearchOutsideUK);
  if (loading) {
    return (
      <div className="space-y-4" aria-busy>
        <div aria-hidden>
          {/* Online, the heading stands alone. Near a place, the note says how the list is ordered as well as what its pins
              show, which takes two lines. */}
          <Summary
            title={<SkeletonText className="w-48" />}
            sub={!online && <SkeletonText className="w-56" />}
            note={!online && <SkeletonText lines={2} className="w-1/2" />}
          />
        </div>
        {Array.from({ length: 4 }, (_, i) => (
          <TherapistCardSkeleton key={i} online={online} />
        ))}
      </div>
    );
  }
  if (query.isLoadingError) return <ResultsError error={query.error} params={params} />;

  const count = first?.total;
  const located = searchedPlace !== undefined;
  const highlight = (slug: string) => (on: boolean) => onHighlight?.(on ? slug : undefined);
  const sought = soughtTerms(params);
  const feeOf = (t: Therapist) => feeText(officeOf(t)?.cost);

  return (
    // Dims while the next search's results are on their way.
    <section aria-busy={stale} className={cn("space-y-4 motion-safe:transition-opacity", stale && "opacity-60")}>
      {/* The heading and each entry fade in as they replace their skeleton or arrive, and again as their tab is shown,
          which starts their animations afresh. Side by side rather than one within another, so no fade dims another. */}
      <div className="space-y-4 fade-in-0 motion-safe:animate-in">
        {/* With no one found, the heading has said so, and the place still says where. Online, the heading stands alone. */}
        <Summary
          title={resultsHeading(therapists, count, located)}
          sub={searchedPlace ?? (!online && therapists.length > 0 && `${therapists.length} of ${count}`)}
          note={!online && therapists.length > 0 && listNote(located, unplaced.length)}
        />
        <LocationNotice typed={params.text.Location} searched={first?.locationSearched} />
        {first?.notices.filter((notice) => !UKCP_PAGING.test(notice)).map((notice) => (
          <Alert key={notice}>
            <AlertDescription>{notice}</AlertDescription>
          </Alert>
        ))}
      </div>
      <ul ref={listRef} className="space-y-4">
        {listEntries(therapists, pins).map((entry) => {
          const { key, pin, therapist: t } = entry;
          const marked = pin !== undefined && pin.key === selected?.key;
          return (
            // Marked by pin, so the page can bring a selected pin's entry into view.
            <li
              key={key}
              data-pin={pin?.key}
              aria-current={marked || undefined}
              className={cn("rounded-xl fade-in-0 motion-safe:animate-in", marked && t && "ring-2 ring-highlight")}
            >
              {t ? (
                <TherapistCard
                  therapist={t}
                  sought={sought}
                  online={online}
                  action={<ShortlistButton therapist={t} />}
                  fee={feeOf(t)}
                  onHighlight={highlight(t.slug)}
                />
              ) : (
                <PinGroup pin={entry.pin} marked={marked} sought={sought} feeOf={feeOf} highlight={highlight} />
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** The list's heading and the lines under it, shared by the list and its skeleton. */
function Summary({ title, sub, note }: { title: ReactNode; sub?: ReactNode; note?: ReactNode }) {
  return (
    <div className="space-y-1">
      <h2 className="font-heading text-xl font-medium">{title}</h2>
      {sub && <p className="text-sm text-muted-foreground">{sub}</p>}
      {note && <p className="text-xs text-muted-foreground">{note}</p>}
    </div>
  );
}

/** How the list is ordered and what its pins show. UKCP measures each distance to the therapist's address. */
function listNote(located: boolean, unplaced: number): string {
  const order = located ? "Nearest first, measured from the centre of the place searched. " : "";
  return `${order}Pins show the postcode or area each therapist lists${unplaced > 0 ? ` · ${unplaced} not on the map` : ""}.`;
}

/**
 * Says why a search asked of UKCP whole (`asksWhole`) is taking a while, once it has. Its status region is always there,
 * since a screen reader announces changes to a region it already knows.
 */
function SlowNote({ loading, whole }: { loading: boolean; whole: boolean }) {
  const [slow, setSlow] = useState(false);
  const waiting = loading && whole;
  useEffect(() => {
    if (!waiting) return;
    const timer = setTimeout(() => setSlow(true), SLOW_MS);
    return () => {
      clearTimeout(timer);
      setSlow(false);
    };
  }, [waiting]);
  return (
    <p role="status" className={cn("text-sm text-muted-foreground", !(waiting && slow) && "sr-only")}>
      {waiting && slow ? "Getting every result. The first time can take a few seconds." : ""}
    </p>
  );
}

type PinGroupProps = {
  pin: Pin;
  marked: boolean;
  sought: ReadonlySet<string>;
  feeOf: (t: Therapist) => string | undefined;
  highlight: (slug: string) => (on: boolean) => void;
};

/** Everyone at a stacked pin, under the place they list. */
function PinGroup({ pin, marked, sought, feeOf, highlight }: PinGroupProps) {
  const headingId = useId();
  return (
    // A group rather than a section, which would make every place a landmark.
    <div
      role="group"
      aria-labelledby={headingId}
      className={cn("space-y-3 rounded-xl border p-3 transition-colors", marked && "border-highlight bg-highlight/10 ring-1 ring-highlight")}
    >
      <h2 id={headingId} className="eyebrow flex items-center gap-1.5 text-primary">
        <MapPin aria-hidden className={cn("size-4 shrink-0", marked ? "text-highlight" : "text-muted-foreground")} />
        {/* The space parts the two in the group's name; the dot does so on screen, where spaced capitals run together. */}
        {pinLabel(pin)} <span aria-hidden>·</span> <span className="font-normal text-muted-foreground">{pin.therapists.length} therapists</span>
      </h2>
      <ul className="space-y-3">
        {pin.therapists.map((t) => (
          <li key={t.slug}>
            <TherapistCard
              therapist={t}
              sought={sought}
              grouped
              action={<ShortlistButton therapist={t} />}
              fee={feeOf(t)}
              onHighlight={highlight(t.slug)}
            />
          </li>
        ))}
      </ul>
    </div>
  );
}
