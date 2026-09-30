import { SlidersHorizontal, X } from "lucide-react";
import { lazy, Suspense, useEffect, useId, useRef, useState, type ComponentProps } from "react";
import { Link, useLocation } from "react-router";
import { OPTIONS } from "@shared/options";
import { SEARCH_MILES, toQuery, type SearchParams } from "@shared/query";
import { IconButton } from "@/components/IconButton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Masthead } from "@/layout/Masthead";
import { useMediaQuery } from "@/lib/useMediaQuery";
import { cn } from "@/lib/utils";
import { FilterChips } from "./FilterChips";
import { FilterPanel } from "./FilterPanel";
import { createHighlight } from "./map/highlight";
import { layoutPins, type Pin } from "./map/pins";
import { useCardLookups, useCentre } from "./map/usePlaces";
import { LoadMore } from "./LoadMore";
import { reachMiles, resultCount } from "./reach";
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

// Leaflet comes in its own chunk, so the results never wait for it and a visit that searches nothing never loads it.
const MapPane = lazy(() => import("./map/MapPane"));

/** Wide enough for the results to sit beside the map rather than over it. */
const WIDE = "(min-width: 64rem)";

/** Before the centre is known, when place names can't yet be judged by their distance from it. */
const NOT_LAID_OUT: ReturnType<typeof layoutPins> = { pins: [], unplaced: [] };

/** Space left above a selected pin's entry as it scrolls into view. */
const REVEAL_GAP_PX = 8;

export function SearchPage() {
  const { params, error, update } = useSearchState();
  if (!params) {
    return (
      <div className="m-4 space-y-4">
        <Masthead />
        <Alert variant="destructive">
          <AlertDescription>
            This search link isn't valid: {error?.message}.{" "}
            <Link to="/" className="underline">
              Start a new search
            </Link>
          </AlertDescription>
        </Alert>
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
  // What the map frames, and what a selection belongs to.
  const fitKey = searching ? toQuery(params) : "";
  const results = useResults(params, searching);
  const centre = useCentre(results.searchedPlace, params.flags.LocationSearchOutsideUK);
  // The place searched comes with the results, so there is none until a first search's results arrive; while the next
  // search loads, the results, and so the place, are still the last search's.
  const centreSettled = centre.settled && !results.query.isPending && !results.query.isPlaceholderData;
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
  // Open on arriving at the prompt on a wide screen, where there is no map for them to cover.
  const [filtersOpen, setFiltersOpen] = useState(!searching && wide);
  // The sheet opens on the list, and does again after the prompt, which has none.
  const [sheet, setSheet] = useState<SheetPosition>("full");
  if (!searching && sheet !== "full") setSheet("full");
  const scroll = useRememberedScroll(entry, !results.query.isPending);
  const listRef = useRef<HTMLUListElement>(null);
  // Whether the list was showing when a pin was selected, so it can glide to the pin's entry rather than jump.
  const listShowing = useRef(false);

  function select(pin: Pin) {
    if (pin.key === selected?.key) {
      setSelection(undefined);
      return;
    }
    setSelection({ fitKey, pinKey: pin.key });
    listShowing.current = wide ? panelOpen : sheet !== "peek";
    if (wide) setPanelOpen(true);
    else if (sheet === "peek") setSheet("half");
  }

  const selectedKey = selected?.key;
  // After the render that opens the panel or raises the sheet, so the list is there to scroll.
  useEffect(() => {
    const list = scroll.ref.current;
    const entry = selectedKey === undefined ? null : list?.querySelector<HTMLElement>(`[data-pin="${selectedKey}"]`);
    if (list && entry) reveal(list, entry, listShowing.current);
  }, [scroll.ref, selectedKey]);

  const count = results.first?.total;
  const title = results.searchedPlace === undefined || count === undefined ? resultCount(count) : `${resultCount(count)} within your area`;

  const list = (
    <Results
      params={params}
      results={results}
      listRef={listRef}
      pins={pins}
      unplaced={unplaced}
      selected={selected}
      onHighlight={highlight.set}
    />
  );
  const footer = <LoadMore results={results} listRef={listRef} placing={placing} />;

  // The toolbar keeps its place in the tree as the prompt gives way to a search, so what is typed or open in it stays.
  return (
    <>
      {/* With no results to head, the site's name heads the page. */}
      {!searching && <Masthead className="border-b px-4 py-3" />}
      <div className="flex min-h-0 flex-1">
        {wide && searching && (
          <ResultsPanel
            open={panelOpen}
            onOpenChange={setPanelOpen}
            title={title}
            masthead={<Masthead className="border-b px-4 py-3" />}
            scrollRef={scroll.ref}
            onScroll={scroll.save}
            footer={footer}
          >
            {list}
          </ResultsPanel>
        )}
        <div className="relative min-w-0 flex-1">
          {searching ? (
            <Suspense fallback={<div className="size-full bg-muted" />}>
              <MapPane
                fitKey={fitKey}
                entry={entry}
                centre={centre.point}
                reachMiles={reachMiles(results.therapists)}
                centreSettled={centreSettled}
                pins={pins}
                placing={placing}
                highlight={highlight}
                selected={selected}
                onSelect={select}
              />
            </Suspense>
          ) : (
            <SearchPrompt besideFilters={wide && filtersOpen} />
          )}
          <MapToolbar params={params} onChange={onChange} drafts={drafts} wide={wide} filtersOpen={filtersOpen} onFiltersOpenChange={setFiltersOpen} />
          {!wide && searching && (
            <ResultsSheet position={sheet} onPositionChange={setSheet} title={title} scrollRef={scroll.ref} onScroll={scroll.save} footer={footer}>
              <Masthead className="pb-3" />
              {list}
            </ResultsSheet>
          )}
        </div>
      </div>
    </>
  );
}

/** Scrolls the list to put `entry` just below its top, unless it is already wholly in view. */
function reveal(list: HTMLElement, entry: HTMLElement, glide: boolean) {
  const view = list.getBoundingClientRect();
  const { top, bottom } = entry.getBoundingClientRect();
  if (top >= view.top && bottom <= view.bottom) return;
  const smooth = glide && !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  list.scrollTo({ top: list.scrollTop + top - view.top - REVEAL_GAP_PX, behavior: smooth ? "smooth" : "auto" });
}

/** The search box, filters and active-filter chips, floating over the top of the map or the prompt. */
function MapToolbar({
  params,
  onChange,
  drafts,
  wide,
  filtersOpen,
  onFiltersOpenChange,
}: ViewProps & { drafts: SearchDrafts; wide: boolean; filtersOpen: boolean; onFiltersOpenChange: (open: boolean) => void }) {
  const filtersId = useId();
  // UKCP's groups rather than the panel's, so the outside-UK tick, which makes no chip and survives Clear all, goes uncounted.
  const ticked = OPTIONS.groups.reduce((sum, group) => sum + tickedIn(params, group), 0);
  return (
    // Only the toolbar's own controls take the pointer; the map shows through the rest of it.
    <div className="pointer-events-none absolute inset-3 z-10 flex flex-col items-start gap-2 lg:right-auto lg:w-96">
      <div className="pointer-events-auto flex w-full items-start gap-2 rounded-xl border bg-background p-2 shadow-md">
        {/* A search for a place puts the filters away to show where it is; ticks and the keyword leave them open for more. */}
        <SearchBox params={params} drafts={drafts} onPlaceSearch={() => onFiltersOpenChange(false)} className="min-w-0 flex-1" />
        {wide ? (
          <FiltersButton
            ticked={ticked}
            aria-expanded={filtersOpen}
            aria-controls={filtersOpen ? filtersId : undefined}
            onClick={() => onFiltersOpenChange(!filtersOpen)}
          />
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
          className="pointer-events-auto flex min-h-0 w-full flex-col overflow-hidden rounded-xl border bg-background shadow-lg"
        >
          <div className="flex items-center justify-between gap-2 border-b p-3 pl-4">
            <h2 id={`${filtersId}-heading`} className="font-semibold">
              Refine your search
            </h2>
            <Button type="button" variant="ghost" size="icon-sm" aria-label="Close filters" onClick={() => onFiltersOpenChange(false)}>
              <X aria-hidden />
            </Button>
          </div>
          <div className="min-h-0 overflow-y-auto p-4">
            <FilterPanel params={params} drafts={drafts} />
          </div>
        </section>
      )}
    </div>
  );
}

/** In place of the map and results until there is something to search for, so no map tiles are fetched for nothing. */
function SearchPrompt({ besideFilters }: { besideFilters: boolean }) {
  return (
    // Clear of the toolbar over its top, or beside the filters open beneath it.
    <div className={cn("flex size-full overflow-y-auto", besideFilters ? "py-6 pr-6 pl-105" : "px-6 py-24")}>
      {/* Centred by its margins, so text taller than the space scrolls from its top rather than being cut off there. */}
      <div className="m-auto max-w-2xl space-y-4 text-center text-balance sm:space-y-6">
        <p className="text-2xl font-semibold tracking-tight sm:text-4xl">
          Search a town, city or postcode to see the UKCP therapists within your area, nearest first.
        </p>
        <p className="text-lg text-muted-foreground sm:text-xl">
          Filters <SlidersHorizontal aria-hidden className="inline size-[0.9em] align-[-0.1em]" /> narrow the search by what therapists help with, how
          they work, the languages they speak and more.
        </p>
      </div>
    </div>
  );
}

function MobileFilters({ params, drafts, ticked }: { params: SearchParams; drafts: SearchDrafts; ticked: number }) {
  const [open, setOpen] = useState(false);
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <FiltersButton ticked={ticked} />
      </SheetTrigger>
      <SheetContent side="left" className="gap-0">
        <SheetHeader className="border-b">
          <SheetTitle>Refine your search</SheetTitle>
        </SheetHeader>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 pt-4 pb-6">
          {/* Searching closes the sheet to show its results; ticks leave it open for more. */}
          <FilterPanel params={params} drafts={drafts} onSearch={() => setOpen(false)} />
        </div>
      </SheetContent>
    </Sheet>
  );
}

/** With the number of ticked filters on its corner. */
function FiltersButton({ ticked, className, ...props }: Omit<ComponentProps<typeof IconButton>, "label"> & { ticked: number }) {
  return (
    <IconButton label="Filters" variant="outline" className={cn("relative", className)} {...props}>
      <SlidersHorizontal aria-hidden />
      <TickedCount count={ticked} className="absolute -top-1.5 -right-1.5 h-4 min-w-4 px-1 text-[0.625rem]" />
    </IconButton>
  );
}
