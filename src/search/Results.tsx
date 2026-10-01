import { MapPin } from "lucide-react";
import { useId, useLayoutEffect, useRef, type ReactNode, type Ref } from "react";
import { toQuery, type SearchParams } from "@shared/query";
import type { TherapistCard as Therapist } from "@shared/types";
import { useFailure } from "@/components/FailedAlert";
import { SkeletonText } from "@/components/SkeletonText";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { cn } from "@/lib/utils";
import { ShortlistButton } from "@/shortlist/ShortlistButton";
import { soughtTerms } from "./activeFilters";
import { LocationNotice } from "./LocationNotice";
import { listEntries, pinLabel, type Pin } from "./map/pins";
import { reachLine, resultCount } from "./reach";
import { ResultsError } from "./ResultsError";
import { useSlowLine } from "./ResultsStatus";
import { TherapistCard, TherapistCardSkeleton } from "./TherapistCard";
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

/** A search's list. Its ResultsStatus goes outside it, as the list is marked busy and dimmed while it loads. */
export function Results({ params, results, listRef, pins = [], unplaced = [], selected, onHighlight, online = false }: Props) {
  const { query, first, therapists, searchedPlace } = results;
  const failure = useFailure(query, toQuery(params));
  // Kept from screen readers, which the status region tells.
  const slow = useSlowLine(params, results);
  const slowNote = slow && (
    <p aria-hidden className="mb-4 text-sm text-muted-foreground">
      {slow}
    </p>
  );
  const heading = useRef<HTMLHeadingElement>(null);
  // Whether the failed search was tried again, until its results arrive.
  const retried = useRef(false);
  // A retry that works takes Try again away, dropping focus to the page; the keyboard carries on from the list's heading.
  useLayoutEffect(() => {
    if (!retried.current || failure.error) return;
    retried.current = false;
    if (document.activeElement === document.body) heading.current?.focus();
  }, [failure.error]);
  if (failure.error) {
    const retry = () => {
      retried.current = true;
      failure.retry();
    };
    return <ResultsError error={failure.error} params={params} retrying={failure.retrying} onRetry={retry} />;
  }
  if (query.isPending) {
    return (
      <div className="space-y-4" aria-busy>
        {slowNote}
        <div aria-hidden className="space-y-4">
          <Summary title={<SkeletonText className="w-48" />} reach={<SkeletonText className="w-56" />} note={<SkeletonText className="w-64" />} />
          {/* A search near a place names the place, and UKCP notes how it orders the results around it. */}
          {!online && (
            <>
              <p className="text-sm">
                <SkeletonText className="w-52" />
              </p>
              <Alert>
                <AlertDescription>
                  <SkeletonText lines={3} className="w-2/5" />
                </AlertDescription>
              </Alert>
            </>
          )}
        </div>
        {Array.from({ length: 4 }, (_, i) => (
          <TherapistCardSkeleton key={i} online={online} />
        ))}
      </div>
    );
  }

  const count = first?.total;
  const title = searchedPlace === undefined || count === undefined ? resultCount(count) : `${resultCount(count)} within your area`;
  const reach = reachLine(therapists, count ?? 0, searchedPlace !== undefined);
  const highlight = (slug: string) => (on: boolean) => onHighlight?.(on ? slug : undefined);
  const sought = soughtTerms(params);

  return (
    <>
      {slowNote}
      {/* Dims while the next search's results are on their way. */}
      <section aria-busy={query.isPlaceholderData} className={cn("space-y-4 motion-safe:transition-opacity", query.isPlaceholderData && "opacity-60")}>
        {/* The heading and each entry fade in as they replace their skeleton or arrive, and again as their tab is shown,
            which starts their animations afresh. Side by side rather than one within another, so no fade dims another. */}
        <div className="space-y-4 fade-in-0 motion-safe:animate-in">
          {/* With no one found, the heading has said so. */}
          <Summary
            headingRef={heading}
            title={title}
            reach={therapists.length > 0 && (unplaced.length > 0 ? `${reach} · ${unplaced.length} not on the map` : reach)}
            note={
              therapists.length > 0 &&
              (online ? "Only therapists who say they work online or by phone." : "Pins show the postcode or area each therapist lists.")
            }
          />
          <LocationNotice typed={params.text.Location} searched={first?.locationSearched} />
          {first?.notices.map((notice) => (
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
                  <TherapistCard therapist={t} sought={sought} online={online} action={<ShortlistButton therapist={t} />} onHighlight={highlight(t.slug)} />
                ) : (
                  <PinGroup pin={entry.pin} marked={marked} sought={sought} highlight={highlight} />
                )}
              </li>
            );
          })}
        </ul>
      </section>
    </>
  );
}

/** The list's heading and the lines under it, shared by the list and its skeleton. */
function Summary({ title, reach, note, headingRef }: { title: ReactNode; reach?: ReactNode; note?: ReactNode; headingRef?: Ref<HTMLHeadingElement> }) {
  return (
    <div className="space-y-1">
      {/* Focused only by the page, when what held the keyboard goes. */}
      <h2 ref={headingRef} tabIndex={-1} className="rounded-sm font-heading text-xl font-medium outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
        {title}
      </h2>
      {reach && <p className="text-sm text-muted-foreground">{reach}</p>}
      {note && <p className="text-xs text-muted-foreground">{note}</p>}
    </div>
  );
}

type PinGroupProps = { pin: Pin; marked: boolean; sought: ReadonlySet<string>; highlight: (slug: string) => (on: boolean) => void };

/** Everyone at a stacked pin, under the place they list. */
function PinGroup({ pin, marked, sought, highlight }: PinGroupProps) {
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
            <TherapistCard therapist={t} sought={sought} grouped action={<ShortlistButton therapist={t} />} onHighlight={highlight(t.slug)} />
          </li>
        ))}
      </ul>
    </div>
  );
}
