import { SlidersHorizontal, X } from "lucide-react";
import { lazy, Suspense, useId, useState } from "react";
import { Link, useLocation } from "react-router";
import { OPTIONS } from "@shared/options";
import { toQuery, type SearchParams } from "@shared/query";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Disclaimer } from "@/layout/Disclaimer";
import { useMediaQuery } from "@/lib/useMediaQuery";
import { cn } from "@/lib/utils";
import { FilterChips } from "./FilterChips";
import { FilterPanel } from "./FilterPanel";
import { useCentre } from "./map/usePlaces";
import { Results } from "./Results";
import { ResultsPanel } from "./ResultsPanel";
import { ResultsSheet, type SheetPosition } from "./ResultsSheet";
import { SearchBox } from "./SearchBox";
import { tickedIn } from "./state";
import { TickedCount } from "./TickedCount";
import { useResults } from "./useResults";
import { useSearchDrafts, type SearchDrafts } from "./useSearchDrafts";
import { useSearchState } from "./useSearchState";
import { useRememberedScroll } from "./viewMemory";

// Leaflet comes in its own chunk, so the results never wait for it.
const MapPane = lazy(() => import("./map/MapPane"));

/** Wide enough for the results to sit beside the map rather than over it. */
const WIDE = "(min-width: 64rem)";

export function SearchPage() {
  const { params, error, update } = useSearchState();
  if (!params) {
    return (
      <div className="m-4">
        <Alert variant="destructive">
          <AlertDescription>
            This search link isn't valid: {error?.message}.{" "}
            <Link to="/" className="underline">
              Start a new search
            </Link>
          </AlertDescription>
        </Alert>
        <Disclaimer className="mt-8 text-xs" />
      </div>
    );
  }
  return <SearchView params={params} onChange={update} />;
}

type ViewProps = { params: SearchParams; onChange: (next: SearchParams) => void };

function SearchView({ params, onChange }: ViewProps) {
  const wide = useMediaQuery(WIDE);
  const { key: entry } = useLocation();
  const drafts = useSearchDrafts(params, onChange);
  const results = useResults(params);
  const centre = useCentre(results.searchedPlace, params.flags.LocationSearchOutsideUK);
  // While the next search loads, the results, and so the place searched, are still the last search's.
  const centreSettled = centre.settled && !results.query.isPlaceholderData;
  const [panelOpen, setPanelOpen] = useState(true);
  const [sheet, setSheet] = useState<SheetPosition>("full");
  const scroll = useRememberedScroll(entry, !results.query.isPending);
  const count = results.first?.total;

  const list = (
    <>
      <Results params={params} results={results} />
      <Disclaimer className="mt-8 text-xs" />
    </>
  );

  return (
    <div className="flex min-h-0 flex-1">
      {wide && (
        <ResultsPanel open={panelOpen} onOpenChange={setPanelOpen} count={count} scrollRef={scroll.ref} onScroll={scroll.save}>
          {list}
        </ResultsPanel>
      )}
      <div className="relative min-w-0 flex-1">
        <Suspense fallback={<div className="size-full bg-muted" />}>
          <MapPane fitKey={toQuery(params)} entry={entry} centre={centre.point} centreSettled={centreSettled} radiusMiles={drafts.distance} />
        </Suspense>
        <MapToolbar params={params} onChange={onChange} drafts={drafts} wide={wide} />
        {!wide && (
          <ResultsSheet position={sheet} onPositionChange={setSheet} count={count} scrollRef={scroll.ref} onScroll={scroll.save}>
            {list}
          </ResultsSheet>
        )}
      </div>
    </div>
  );
}

/** The search box, filters and active-filter chips, floating over the top of the map. */
function MapToolbar({ params, onChange, drafts, wide }: ViewProps & { drafts: SearchDrafts; wide: boolean }) {
  const [filtersOpen, setFiltersOpen] = useState(false);
  const filtersId = useId();
  const ticked = OPTIONS.groups.reduce((sum, group) => sum + tickedIn(params, group), 0);
  return (
    // Only the toolbar's own controls take the pointer; the map shows through the rest of it.
    <div className="pointer-events-none absolute inset-3 z-10 flex flex-col items-start gap-2 lg:right-auto lg:w-96">
      <div className="pointer-events-auto flex w-full gap-2 rounded-xl border bg-background p-2 shadow-md">
        <SearchBox params={params} drafts={drafts} className="min-w-0 flex-1" />
        {wide ? (
          <Button
            type="button"
            variant="outline"
            aria-expanded={filtersOpen}
            aria-controls={filtersOpen ? filtersId : undefined}
            onClick={() => setFiltersOpen((open) => !open)}
          >
            <SlidersHorizontal aria-hidden />
            Filters
            <TickedCount count={ticked} />
          </Button>
        ) : (
          <MobileFilters params={params} drafts={drafts} ticked={ticked} />
        )}
      </div>
      <FilterChips
        params={params}
        onChange={onChange}
        // Only as wide as its chips, up to the toolbar's width, so it covers no more of the map than they do.
        className={cn("pointer-events-auto", !wide && "max-w-full flex-nowrap overflow-x-auto [&>li]:shrink-0")}
      />
      {wide && filtersOpen && (
        <section
          id={filtersId}
          aria-label="Refine your search"
          className="pointer-events-auto min-h-0 w-full overflow-y-auto rounded-xl border bg-background p-4 shadow-lg"
        >
          <div className="-mt-1 -mr-1 flex justify-end">
            <Button type="button" variant="ghost" size="icon-sm" aria-label="Close filters" onClick={() => setFiltersOpen(false)}>
              <X aria-hidden />
            </Button>
          </div>
          <FilterPanel params={params} drafts={drafts} />
        </section>
      )}
    </div>
  );
}

function MobileFilters({ params, drafts, ticked }: { params: SearchParams; drafts: SearchDrafts; ticked: number }) {
  const [open, setOpen] = useState(false);
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="outline">
          <SlidersHorizontal aria-hidden />
          Filters
          <TickedCount count={ticked} />
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Refine your search</SheetTitle>
        </SheetHeader>
        <div className="px-4 pb-6">
          {/* Searching closes the sheet to show its results; ticks leave it open for more. */}
          <FilterPanel params={params} drafts={drafts} onSearch={() => setOpen(false)} />
        </div>
      </SheetContent>
    </Sheet>
  );
}
