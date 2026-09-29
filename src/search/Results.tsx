import { MapPin } from "lucide-react";
import { useId, type Ref } from "react";
import type { SearchParams } from "@shared/query";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { soughtTerms } from "./activeFilters";
import { LocationNotice } from "./LocationNotice";
import { listEntries, pinLabel, UNPLACED_REASONS, type Pin, type Unplaced } from "./map/pins";
import { reachLine } from "./reach";
import { ResultsError } from "./ResultsError";
import { TherapistCard } from "./TherapistCard";
import type { SearchResults } from "./useResults";

type Props = {
  params: SearchParams;
  results: SearchResults;
  /** The list of cards, for "Load more" to hand the keyboard on to. */
  listRef?: Ref<HTMLUListElement>;
  pins?: Pin[];
  unplaced?: Unplaced[];
  /** The pin last activated on the map, whose place in the list is marked. */
  selected?: Pin;
  /** The therapist whose card the pointer or focus is on, for the map to ring their pin. */
  onHighlight?: (slug: string | undefined) => void;
};

export function Results({ params, results, listRef, pins = [], unplaced = [], selected, onHighlight }: Props) {
  const { query, first, therapists, searchedPlace } = results;
  if (query.isPending) {
    return (
      <div className="space-y-4" aria-busy>
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-32 w-full rounded-xl" />
        ))}
      </div>
    );
  }
  if (query.isLoadingError) return <ResultsError error={query.error} params={params} />;

  const reasons = new Map(unplaced.map(({ therapist, reason }) => [therapist.slug, UNPLACED_REASONS[reason]] as const));
  const reach = reachLine(therapists, first?.total ?? 0, searchedPlace !== undefined);
  const highlight = (slug: string) => (on: boolean) => onHighlight?.(on ? slug : undefined);
  const sought = soughtTerms(params);

  return (
    <section aria-busy={query.isPlaceholderData} className={cn("space-y-4", query.isPlaceholderData && "opacity-60")}>
      <div className="space-y-1">
        <p className="text-sm text-muted-foreground">{reasons.size > 0 ? `${reach} · ${reasons.size} not on the map` : reach}</p>
        <p className="text-xs text-muted-foreground">Pins show the postcode or area each therapist lists.</p>
      </div>
      <LocationNotice typed={params.text.Location} searched={first?.locationSearched} />
      {first?.notices.map((notice) => (
        <Alert key={notice}>
          <AlertDescription>{notice}</AlertDescription>
        </Alert>
      ))}
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
              className={cn("rounded-xl", marked && t && "ring-2 ring-sky-500")}
            >
              {t ? (
                <TherapistCard therapist={t} sought={sought} note={reasons.get(t.slug)} onHighlight={highlight(t.slug)} />
              ) : (
                <PinGroup pin={entry.pin} marked={marked} sought={sought} highlight={highlight} />
              )}
            </li>
          );
        })}
      </ul>
    </section>
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
      className={cn("space-y-3 rounded-xl border p-3 transition-colors", marked && "border-sky-500 bg-sky-500/10 ring-1 ring-sky-500")}
    >
      <h2 id={headingId} className="flex items-center gap-1.5 text-sm font-semibold">
        <MapPin aria-hidden className={cn("size-4 shrink-0", marked ? "text-sky-600 dark:text-sky-400" : "text-muted-foreground")} />
        {/* The space parts the two in the group's name; the gap does so on screen. */}
        {pinLabel(pin)} <span className="font-normal text-muted-foreground">{pin.therapists.length} therapists</span>
      </h2>
      <ul className="space-y-3">
        {pin.therapists.map((t) => (
          <li key={t.slug}>
            <TherapistCard therapist={t} sought={sought} grouped onHighlight={highlight(t.slug)} />
          </li>
        ))}
      </ul>
    </div>
  );
}
