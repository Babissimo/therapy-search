import type { Ref } from "react";
import type { SearchParams } from "@shared/query";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { LocationNotice } from "./LocationNotice";
import { UNPLACED_REASONS, type Unplaced } from "./map/pins";
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
};

export function Results({ params, results, listRef, unplaced = [] }: Props) {
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
        {therapists.map((t) => (
          <li key={t.slug}>
            <TherapistCard therapist={t} note={reasons.get(t.slug)} />
          </li>
        ))}
      </ul>
    </section>
  );
}
