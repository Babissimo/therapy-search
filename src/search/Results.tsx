import { Loader2, X } from "lucide-react";
import { useEffect, useRef } from "react";
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
  unplaced?: Unplaced[];
  /** The therapists at the pin last activated on the map. */
  selection?: Pin;
  onClearSelection?: () => void;
  /** The therapist whose card the pointer or focus is on, for the map to ring their pin. */
  onHighlight?: (slug: string | undefined) => void;
};

export function Results({ params, results, unplaced = [], selection, onClearSelection, onHighlight }: Props) {
  const { query, first, therapists, searchedPlace } = results;
  const list = useRef<HTMLUListElement>(null);
  // How many cards were listed when the next-page button was pressed while focused, until that fetch settles.
  const focusFrom = useRef<number | null>(null);
  const pages = query.data?.pages.length;
  useEffect(() => {
    const from = focusFrom.current;
    if (from === null || query.isFetchingNextPage) return;
    focusFrom.current = null;
    // The last page takes the button away, dropping focus to the page; the keyboard carries on from the first new card.
    const dropped = document.activeElement === null || document.activeElement === document.body;
    if (!query.hasNextPage && dropped) list.current?.children[from]?.querySelector("a")?.focus();
  }, [pages, query.isFetchingNextPage, query.hasNextPage]);
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
        <section aria-label="At this pin" className="space-y-3 rounded-xl border bg-muted/40 p-3">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold">At this pin</h2>
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
      <ul ref={list} className="space-y-4">
        {therapists.map((t) => (
          <li key={t.slug}>
            <TherapistCard therapist={t} note={reasons.get(t.slug)} onHighlight={highlight(t.slug)} />
          </li>
        ))}
      </ul>
      {/* A next page that failed is still to come, so this stays for its retry. */}
      {query.hasNextPage && !query.isPlaceholderData && (
        <div>
          {query.isFetchNextPageError && (
            <Alert variant="destructive" className="mb-4">
              <AlertDescription>{query.error?.message}</AlertDescription>
            </Alert>
          )}
          {/* One button loads and retries, so keyboard focus stays on it through a failure. */}
          <Button
            type="button"
            variant="outline"
            className="w-full aria-disabled:opacity-50"
            // Not disabled while loading, which would drop focus; a second press is ignored, as it would restart the fetch.
            aria-disabled={query.isFetchingNextPage}
            onClick={(event) => {
              if (query.isFetchingNextPage) return;
              focusFrom.current = document.activeElement === event.currentTarget ? therapists.length : null;
              query.fetchNextPage();
            }}
          >
            {query.isFetchingNextPage && <Loader2 className="animate-spin" aria-hidden />}
            {query.isFetchNextPageError ? "Try again" : "Load more"}
          </Button>
          <p aria-live="polite" className="sr-only">
            {query.isFetchingNextPage ? "Loading more results" : ""}
          </p>
        </div>
      )}
    </section>
  );
}
