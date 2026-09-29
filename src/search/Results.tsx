import { MapPin, X } from "lucide-react";
import type { Ref } from "react";
import type { SearchParams } from "@shared/query";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { LocationNotice } from "./LocationNotice";
import { UNPLACED_REASONS, type Pin, type Unplaced } from "./map/pins";
import { reachLine } from "./reach";
import { ResultsError } from "./ResultsError";
import { TherapistCard } from "./TherapistCard";
import type { SearchResults } from "./useResults";

type Props = {
  params: SearchParams;
  results: SearchResults;
  /** The list of cards, for "Load more" to hand the keyboard on to. */
  listRef?: Ref<HTMLUListElement>;
  unplaced?: Unplaced[];
  /** The therapists at the pin last activated on the map. */
  selection?: Pin;
  onClearSelection?: () => void;
  /** The therapist whose card the pointer or focus is on, for the map to ring their pin. */
  onHighlight?: (slug: string | undefined) => void;
};

export function Results({ params, results, listRef, unplaced = [], selection, onClearSelection, onHighlight }: Props) {
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

  return (
    <section aria-busy={query.isPlaceholderData} className={cn("space-y-4", query.isPlaceholderData && "opacity-60")}>
      {selection && (
        <section
          // Keyed by pin, so each new selection draws the eye as it arrives.
          key={selection.key}
          aria-label="At this pin"
          className="space-y-3 rounded-xl border-2 border-sky-500 bg-sky-500/10 p-3 animate-in fade-in slide-in-from-top-2 duration-300"
        >
          <div className="flex items-center justify-between gap-2">
            <h2 className="flex items-center gap-1.5 text-sm font-semibold">
              <MapPin aria-hidden className="size-4 text-sky-600 dark:text-sky-400" />
              At this pin
              <span className="font-normal text-muted-foreground">
                {selection.therapists.length === 1 ? "1 therapist" : `${selection.therapists.length} therapists`}
              </span>
            </h2>
            <Button type="button" variant="ghost" size="sm" onClick={onClearSelection}>
              <X aria-hidden />
              Clear selection
            </Button>
          </div>
          <ul className="space-y-3">
            {selection.therapists.map((t) => (
              <li key={t.slug}>
                <TherapistCard therapist={t} onHighlight={highlight(t.slug)} />
              </li>
            ))}
          </ul>
        </section>
      )}
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
        {therapists.map((t) => (
          <li key={t.slug}>
            <TherapistCard therapist={t} note={reasons.get(t.slug)} onHighlight={highlight(t.slug)} />
          </li>
        ))}
      </ul>
    </section>
  );
}
