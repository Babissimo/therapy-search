import { MapPin, SlidersHorizontal, X } from "lucide-react";
import { lazy, Suspense, useEffect, useId, useRef, useState } from "react";
import { Link, useLocation } from "react-router";
import { OPTIONS } from "@shared/options";
import { SEARCH_MILES, toQuery, type SearchParams } from "@shared/query";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Disclaimer } from "@/layout/Disclaimer";
import { useMediaQuery } from "@/lib/useMediaQuery";
import { cn } from "@/lib/utils";
import { FilterChips } from "./FilterChips";
import { FilterPanel } from "./FilterPanel";
import { createHighlight } from "./map/highlight";
import { layoutPins, type Pin } from "./map/pins";
import { useCardLookups, useCentre } from "./map/usePlaces";
import { LoadMore } from "./LoadMore";
import { resultCount } from "./reach";
import { Results } from "./Results";
import { ResultsPanel } from "./ResultsPanel";
import { ResultsSheet, type SheetPosition } from "./ResultsSheet";
import { SearchBox } from "./SearchBox";
import { tickedIn, withFlag } from "./state";
import { TickedCount } from "./TickedCount";
import { useResults } from "./useResults";
import { useSearchDrafts, type SearchDrafts } from "./useSearchDrafts";
import { useSearchState } from "./useSearchState";
import { useRememberedScroll } from "./viewMemory";

// Leaflet comes in its own chunk, so the results never wait for it.
const MapPane = lazy(() => import("./map/MapPane"));

/** Wide enough for the results to sit beside the map rather than over it. */
const WIDE = "(min-width: 64rem)";

/** Before the centre is known, when place names can't yet be judged by their distance from it. */
const NOT_LAID_OUT: ReturnType<typeof layoutPins> = { pins: [], unplaced: [] };

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
  // With nothing to search for, UKCP would list everyone in a random order, which answers no one's question. The
  // outside-UK tick alone is nothing to search for: it only changes how a location is read.
  const searching = toQuery(withFlag(params, "LocationSearchOutsideUK", false)) !== "";
  // What the map frames: nothing, and so the UK, until there is a search.
  const fitKey = searching ? toQuery(params) : "";
  const results = useResults(params, searching);
  const centre = useCentre(results.searchedPlace, params.flags.LocationSearchOutsideUK);
  // While the next search loads, the results, and so the place searched, are still the last search's.
  const centreSettled = centre.settled && !results.query.isPlaceholderData;
  const lookupFor = useCardLookups(
    results.therapists.map((t) => t.location),
    params.flags.LocationSearchOutsideUK,
  );
  const { pins, unplaced } = centre.settled
    ? layoutPins(results.therapists, (t) => lookupFor(t.location), centre.point, SEARCH_MILES)
    : NOT_LAID_OUT;
  const placing = results.therapists.some((t) => lookupFor(t.location) === undefined);
  // Kept by key, so the selection follows its pin as Load more adds to it; a new search clears it.
  const [selection, setSelection] = useState<{ fitKey: string; pinKey: string }>();
  const selected = selection?.fitKey === fitKey ? pins.find((pin) => pin.key === selection.pinKey) : undefined;
  const [highlight] = useState(createHighlight);
  // A new search's list can replace a hovered card without a pointerleave or blur, so the highlight ends with the search.
  useEffect(() => {
    highlight.set(undefined);
  }, [highlight, fitKey]);
  const [panelOpen, setPanelOpen] = useState(true);
  // The sheet opens on a search's list, or halfway beside the prompt, and follows as one gives way to the other.
  const [sheet, setSheet] = useState<SheetPosition>(searching ? "full" : "half");
  const [sheetFor, setSheetFor] = useState(searching);
  if (sheetFor !== searching) {
    setSheetFor(searching);
    setSheet(searching ? "full" : "half");
  }
  const scroll = useRememberedScroll(entry, !results.query.isPending);
  const listRef = useRef<HTMLUListElement>(null);

  function select(pin: Pin) {
    setSelection({ fitKey, pinKey: pin.key });
    if (wide) setPanelOpen(true);
    else if (sheet === "peek") setSheet("half");
    // The selection heads the list.
    if (scroll.ref.current) scroll.ref.current.scrollTop = 0;
  }

  const count = results.first?.total;
  const title = results.searchedPlace === undefined || count === undefined ? resultCount(count) : `${resultCount(count)} within your area`;

  const list = (
    <>
      {searching ? (
        <Results
          params={params}
          results={results}
          listRef={listRef}
          unplaced={unplaced}
          selection={selected}
          onClearSelection={() => setSelection(undefined)}
          onHighlight={highlight.set}
        />
      ) : (
        <SearchPrompt />
      )}
      <Disclaimer className="mt-8 text-xs" />
    </>
  );
  const footer = <LoadMore results={results} listRef={listRef} />;

  return (
    <div className="flex min-h-0 flex-1">
      {wide && (
        <ResultsPanel open={panelOpen} onOpenChange={setPanelOpen} title={title} scrollRef={scroll.ref} onScroll={scroll.save} footer={footer}>
          {list}
        </ResultsPanel>
      )}
      <div className="relative min-w-0 flex-1">
        <Suspense fallback={<div className="size-full bg-muted" />}>
          <MapPane
            fitKey={fitKey}
            entry={entry}
            centre={centre.point}
            centreSettled={centreSettled}
            pins={pins}
            placing={placing}
            highlight={highlight}
            selected={selected}
            onSelect={select}
          />
        </Suspense>
        <MapToolbar params={params} onChange={onChange} drafts={drafts} wide={wide} />
        {!wide && (
          <ResultsSheet position={sheet} onPositionChange={setSheet} title={title} scrollRef={scroll.ref} onScroll={scroll.save} footer={footer}>
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
  // UKCP's groups rather than the panel's, so the outside-UK tick, which makes no chip and survives Clear all, goes uncounted.
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
          aria-labelledby={`${filtersId}-heading`}
          className="pointer-events-auto min-h-0 w-full overflow-y-auto rounded-xl border bg-background p-4 shadow-lg"
        >
          <div className="-mt-1 -mr-1 flex items-center justify-between gap-2">
            <h2 id={`${filtersId}-heading`} className="font-semibold">
              Refine your search
            </h2>
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

/** In place of results until there is something to search for. */
function SearchPrompt() {
  return (
    <div className="flex gap-3 py-2">
      <MapPin aria-hidden className="mt-0.5 size-5 shrink-0 text-muted-foreground" />
      <div className="space-y-2 text-sm">
        <p className="font-medium">Search a town, city or postcode to see the UKCP therapists within your area, nearest first.</p>
        <p className="text-muted-foreground">Filters narrow the search by what therapists help with, how they work, the languages they speak and more.</p>
      </div>
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
