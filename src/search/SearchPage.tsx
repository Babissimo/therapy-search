import { Tabs } from "radix-ui";
import { lazy, Suspense, useEffect, useId, useRef, useState } from "react";
import { Link, useLocation, useMatch } from "react-router";
import { canonicalLocation } from "@shared/location";
import { toQuery, type SearchParams } from "@shared/query";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Masthead } from "@/layout/Masthead";
import { useMediaQuery } from "@/lib/useMediaQuery";
import { cn } from "@/lib/utils";
import { ShortlistTab } from "@/shortlist/ShortlistTab";
import { useHasShortlist, useShortlistIf, useShortlistRefresh } from "@/shortlist/useShortlist";
import { soughtTerms } from "./activeFilters";
import { FilterChips } from "./FilterChips";
import { FiltersButton, FiltersSection, MobileFilters } from "./Filters";
import { ListPanels, ListTabs, type ListTab } from "./ListTabs";
import { createHighlight } from "./map/highlight";
import type { MapPaneProps } from "./map/MapPane";
import type { Pin } from "./map/pins";
import { useCentre, usePins } from "./map/usePlaces";
import { LoadMore } from "./LoadMore";
import { ModeSwitch } from "./ModeSwitch";
import { ONLINE_PATH, onlineParams } from "./online";
import { OnlineView } from "./OnlineView";
import { FiltersIcon, Prompt } from "./Prompt";
import { Results } from "./Results";
import { ResultsPanel } from "./ResultsPanel";
import { coverOf, ResultsSheet, type SheetPosition } from "./ResultsSheet";
import { SearchBox } from "./SearchBox";
import { tickedFilters } from "./state";
import { useResults } from "./useResults";
import { useSearchDrafts, type SearchDrafts } from "./useSearchDrafts";
import { useSearchState } from "./useSearchState";
import { useRememberedScroll } from "./viewMemory";

// Leaflet comes in its own chunk, so the results never wait for it and a visit that searches nothing never loads it.
const MapPane = lazy(() => import("./map/MapPane"));

/** Wide enough for the results to sit beside the map rather than over it. */
const WIDE = "(min-width: 64rem)";

const NO_CENTRE = { settled: true };

/** Space left above a selected pin's entry as it scrolls into view. */
const REVEAL_GAP_PX = 8;

/** What the map shows of the list that is open. */
type MapView = Pick<MapPaneProps, "label" | "fitKey" | "centre" | "centreSettled" | "pins" | "placing">;

export function SearchPage() {
  const { params, error, update } = useSearchState();
  const online = useMatch(ONLINE_PATH) !== null;
  const wide = useMediaQuery(WIDE);
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
  if (online) return <OnlineView params={onlineParams(params)} onChange={update} wide={wide} />;
  return <SearchView params={params} onChange={update} wide={wide} />;
}

type ViewProps = { params: SearchParams; onChange: (next: SearchParams) => void; wide: boolean };

/** Therapists near a place, on a map of where they are. */
function SearchView({ params, onChange, wide }: ViewProps) {
  const { key: entry } = useLocation();
  const drafts = useSearchDrafts(params, onChange);
  // Only a place makes a search here: without one UKCP would list everyone matching in a random order, which answers no
  // one looking nearby. Ticks and the keyword wait in the URL for one.
  const searching = params.text.Location !== "";
  // The search, which the tab chosen and a selection belong to.
  const fitKey = searching ? toQuery(params) : "";
  const results = useResults(params, searching);
  useShortlistRefresh(results.therapists);
  const centre = useCentre(results.searchedPlace, params.flags.LocationSearchOutsideUK);
  // The place searched comes with the results, so there is none until a first search's results arrive; while the next
  // search loads, the results, and so the place, are still the last search's.
  const centreSettled = centre.settled && !results.query.isPending && !results.query.isPlaceholderData;
  const { pins, unplaced, placing } = usePins(results.therapists, centre, params.flags.LocationSearchOutsideUK);
  // Kept by key, so a new search shows its results whichever tab was open.
  const [tabChoice, setTabChoice] = useState<{ fitKey: string; tab: ListTab }>();
  const tab = tabChoice?.fitKey === fitKey ? tabChoice.tab : searching ? "results" : "shortlist";
  // Beside a search, the map shows whichever list is open, framing each afresh as its tab opens.
  const mapsShortlist = searching && tab === "shortlist";
  const shortlisted = useShortlistIf(mapsShortlist).map((entry) => entry.card);
  // A shortlist gathers therapists from any search, so their places are read with no centre to choose by or be too far
  // from, and as UK places, since an overseas reading with no centre could put a UK therapist abroad.
  const shortlistPins = usePins(shortlisted, NO_CENTRE, false);
  const mapView: MapView = mapsShortlist
    ? { label: "Map of your shortlist", fitKey: `${fitKey} shortlist`, centreSettled: true, pins: shortlistPins.pins, placing: shortlistPins.placing }
    : { label: "Map of results", fitKey, centre: centre.point, centreSettled, pins, placing };
  // Kept by key, so the selection follows its pin as Load more adds to it; a new search clears it.
  const [selection, setSelection] = useState<{ fitKey: string; pinKey: string }>();
  const selected = selection?.fitKey === fitKey ? mapView.pins.find((pin) => pin.key === selection.pinKey) : undefined;
  const [highlight] = useState(createHighlight);
  // A new search's list can replace a hovered card without a pointerleave or blur, so the highlight ends with the search.
  useEffect(() => {
    highlight.set(undefined);
  }, [highlight, fitKey]);
  const [panelOpen, setPanelOpen] = useState(true);
  // The side bar lists a search's results or, before a search, the shortlist if there is one. Once beside the prompt it
  // stays until a search, so a therapist removed from the shortlist can still be put back.
  const hasShortlist = useHasShortlist();
  const [shortlistKept, setShortlistKept] = useState(!searching && hasShortlist);
  const shortlistBeside = !searching && (hasShortlist || shortlistKept);
  if (shortlistBeside !== shortlistKept) setShortlistKept(shortlistBeside);
  const sideBar = searching || shortlistBeside;
  // Open on arriving at the prompt on a wide screen, where there is no map for them to cover, unless the side bar would
  // leave the prompt too little room beside them.
  const [filtersOpen, setFiltersOpen] = useState(wide && !sideBar);
  // The sheet opens on a search's list, and lowered beneath the prompt, which it would otherwise cover.
  const [sheet, setSheet] = useState<SheetPosition>(searching ? "full" : "peek");
  const [sheetFor, setSheetFor] = useState(searching);
  if (sheetFor !== searching) {
    setSheetFor(searching);
    setSheet(searching ? "full" : "peek");
  }
  // The shortlist keeps its place apart from the results', under a key of its own.
  const scroll = useRememberedScroll(tab === "results" ? entry : `${entry} shortlist`, tab === "shortlist" || !results.query.isPending);
  const listRef = useRef<HTMLUListElement>(null);
  // Whether the list was showing when a pin was selected, so it can glide to the pin's entry rather than jump.
  const listShowing = useRef(false);

  function select(pin: Pin) {
    // Activating the selected pin lets it go.
    if (pin.key === selected?.key) {
      setSelection(undefined);
      return;
    }
    setSelection({ fitKey, pinKey: pin.key });
    listShowing.current = wide ? panelOpen : sheet !== "peek";
    if (wide) setPanelOpen(true);
    else if (sheet === "peek") setSheet("half");
  }

  function pickTab(value: string) {
    setTabChoice({ fitKey, tab: value as ListTab });
    // A selected pin belongs to the list the map was showing.
    setSelection(undefined);
  }

  const selectedKey = selected?.key;
  // After the render that opens the panel or raises the sheet, so the list is there to scroll. The entry is the open
  // tab's, as the results keep theirs, hidden, while the shortlist shows.
  useEffect(() => {
    const list = scroll.ref.current;
    const entry = selectedKey === undefined ? null : list?.querySelector<HTMLElement>(`[role="tabpanel"]:not([hidden]) [data-pin="${selectedKey}"]`);
    if (list && entry) reveal(list, entry, listShowing.current);
  }, [scroll.ref, selectedKey]);

  const list = (
    <Results
      params={params}
      results={results}
      listRef={listRef}
      pins={pins}
      unplaced={unplaced}
      selected={mapsShortlist ? undefined : selected}
      onHighlight={highlight.set}
    />
  );
  const lists = (
    <ListPanels
      tab={tab}
      // Until a search there is nothing to list, and nothing loading whose wait could be timed.
      results={searching && list}
      shortlist={
        <ShortlistTab
          sought={soughtTerms(params)}
          pins={shortlistPins.pins}
          unplaced={shortlistPins.unplaced.length}
          selected={selected}
          onHighlight={highlight.set}
        />
      }
    />
  );
  const footer = tab === "results" ? <LoadMore results={results} listRef={listRef} placing={placing} /> : undefined;
  const tabs = <ListTabs searching={searching} />;
  // The side bar's toggle, left over the top left as the side bar hides, moves the toolbar aside.
  const besideToggle = wide && sideBar && !panelOpen;

  // The toolbar keeps its place in the tree as the prompt gives way to a search, so what is typed or open in it stays.
  return (
    <>
      {/* With no results to head, the site's name heads the page. */}
      {!searching && <Masthead className="border-b px-4 py-3" />}
      {/* The tabs' root is the rest of the page, as their list heads the side bar and their panels fill it. */}
      <Tabs.Root value={tab} onValueChange={pickTab} asChild>
        <div className="group/tabs flex min-h-0 flex-1">
          {wide && sideBar && (
            <ResultsPanel
              open={panelOpen}
              onOpenChange={setPanelOpen}
              tabs={tabs}
              masthead={searching && <Masthead />}
              scrollRef={scroll.ref}
              onScroll={scroll.save}
              footer={footer}
            >
              {lists}
            </ResultsPanel>
          )}
          <div className="relative min-w-0 flex-1">
            {searching ? (
              <Suspense fallback={<div className="size-full bg-muted" />}>
                <MapPane
                  {...mapView}
                  entry={entry}
                  highlight={highlight}
                  selected={selected}
                  onSelect={select}
                  onSearchArea={(postcode) => {
                    if (samePostcode(postcode, params.text.Location)) return false;
                    drafts.submitAt(params, postcode);
                    setFiltersOpen(false);
                    return true;
                  }}
                  outsideUK={params.flags.LocationSearchOutsideUK}
                  coveredBelow={wide ? undefined : (height) => coverOf(sheet, height)}
                />
              </Suspense>
            ) : (
              <SearchPrompt besideFilters={wide && filtersOpen} besideToggle={besideToggle} />
            )}
            <MapToolbar
              params={params}
              onChange={onChange}
              drafts={drafts}
              wide={wide}
              besideToggle={besideToggle}
              filtersOpen={filtersOpen}
              onFiltersOpenChange={setFiltersOpen}
            />
            {!wide && sideBar && (
              <ResultsSheet
                position={sheet}
                onPositionChange={setSheet}
                tabs={tabs}
                lowerLabel={searching ? "Show map" : "Hide list"}
                scrollRef={scroll.ref}
                onScroll={scroll.save}
                footer={footer}
              >
                {searching && <Masthead className="pb-3" />}
                {lists}
              </ResultsSheet>
            )}
          </div>
        </div>
      </Tabs.Root>
    </>
  );
}

/** Whether a location is `postcode`, whatever its case or spacing. */
function samePostcode(postcode: string, location: string): boolean {
  const squeezed = (text: string) => canonicalLocation(text).replaceAll(" ", "");
  return squeezed(postcode) === squeezed(location);
}

/** Scrolls the list to put `entry` just below its top, unless it is already wholly in view. */
function reveal(list: HTMLElement, entry: HTMLElement, glide: boolean) {
  const view = list.getBoundingClientRect();
  const { top, bottom } = entry.getBoundingClientRect();
  if (top >= view.top && bottom <= view.bottom) return;
  const smooth = glide && !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  list.scrollTo({ top: list.scrollTop + top - view.top - REVEAL_GAP_PX, behavior: smooth ? "smooth" : "auto" });
}

/**
 * The switch to online, search box, filters and active-filter chips, floating over the top of the map or the prompt.
 * The buttons the map offers once moved, to search there or recentre, are placed to keep clear of it, so a change to
 * its inset, width or height moves them too.
 */
function MapToolbar({
  params,
  onChange,
  drafts,
  wide,
  besideToggle,
  filtersOpen,
  onFiltersOpenChange,
}: ViewProps & { drafts: SearchDrafts; besideToggle: boolean; filtersOpen: boolean; onFiltersOpenChange: (open: boolean) => void }) {
  const filtersId = useId();
  const ticked = tickedFilters(params);
  return (
    // Only the toolbar's own controls take the pointer; the map shows through the rest of it.
    <div className={cn("pointer-events-none absolute inset-3 z-10 flex flex-col items-start gap-2 lg:right-auto lg:w-96", besideToggle && "left-14")}>
      <div className="pointer-events-auto flex w-full flex-col gap-2 rounded-xl border bg-background p-2 shadow-md">
        <ModeSwitch online={false} params={params} />
        <div className="flex items-start gap-2">
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
      </div>
      <FilterChips
        params={params}
        onChange={onChange}
        // Only as wide as its chips, up to the toolbar's width, so it covers no more of the map than they do.
        className={cn("pointer-events-auto", !wide && "max-w-full flex-nowrap overflow-x-auto [&>li]:shrink-0")}
      />
      {wide && filtersOpen && (
        <FiltersSection
          id={filtersId}
          params={params}
          drafts={drafts}
          onClose={() => onFiltersOpenChange(false)}
          className="pointer-events-auto w-full shadow-lg"
        />
      )}
    </div>
  );
}

/** In place of the map and results until there is something to search for, so no map tiles are fetched for nothing. */
function SearchPrompt({ besideFilters, besideToggle }: { besideFilters: boolean; besideToggle: boolean }) {
  return (
    // Clear of the toolbar over its top, or beside the filters open beneath it.
    <div className={cn("flex size-full overflow-y-auto", besideFilters ? ["py-6 pr-6", besideToggle ? "pl-116" : "pl-105"] : "px-6 py-28")}>
      {/* Centred by its margins, so text taller than the space scrolls from its top rather than being cut off there. */}
      <Prompt ask="Search a town, city or postcode to see the UKCP therapists within your area, nearest first." className="m-auto max-w-2xl">
        Filters <FiltersIcon /> narrow the search by what therapists help with, how they work, the languages they speak and more.
      </Prompt>
    </div>
  );
}
