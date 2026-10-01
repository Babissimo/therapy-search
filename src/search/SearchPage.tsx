import { Tabs } from "radix-ui";
import { lazy, Suspense, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { Link, useLocation, useMatch } from "react-router";
import { canonicalLocation } from "@shared/location";
import { toQuery, type SearchParams } from "@shared/query";
import { Morph, startMorph } from "@/components/Morph";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Collapsible, CollapsibleContent } from "@/components/ui/collapsible";
import { Masthead } from "@/layout/Masthead";
import { useMediaQuery } from "@/lib/useMediaQuery";
import { cn } from "@/lib/utils";
import { ShortlistTab } from "@/shortlist/ShortlistTab";
import { useShortlistIf, useShortlistRefresh } from "@/shortlist/useShortlist";
import { soughtTerms } from "./activeFilters";
import { FilterChips } from "./FilterChips";
import { FiltersButton, FiltersSection, FiltersSheet, FiltersSheetButton } from "./Filters";
import { ListColumn } from "./ListColumn";
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
import { ResultsStatus } from "./ResultsStatus";
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
type MapView = Pick<MapPaneProps, "label" | "fitKey" | "centre" | "centreSettled" | "pins" | "marksShortlist" | "placing">;

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
  // What no Morph within carries, such as the map, fades out with the layout it leaves as the next fades in. A Morph of its
  // own would not: React animates one appearing or leaving only when no element appearing or leaving with it encloses it.
  return (
    <Morph name="search-view">
      {online ? <OnlineView params={onlineParams(params)} onChange={update} wide={wide} /> : <SearchView params={params} onChange={update} wide={wide} />}
    </Morph>
  );
}

type ViewProps = { params: SearchParams; onChange: (next: SearchParams) => void; wide: boolean };

/** Therapists near a place, on a map of where they are. */
function SearchView({ params, onChange, wide }: ViewProps) {
  const { key: entry } = useLocation();
  // Only a place makes a search here: without one UKCP would list everyone matching in a random order, which answers no
  // one looking nearby. Ticks and the keyword wait in the URL for one.
  const searching = placed(params);
  // Beginning or clearing a search sets the page out afresh, its pieces gliding to their new places.
  const change = (next: SearchParams) => (placed(next) === searching ? onChange(next) : startMorph(() => onChange(next)));
  const drafts = useSearchDrafts(params, change);
  // The search, which the tab chosen and a selection belong to.
  const fitKey = searching ? toQuery(params) : "";
  const results = useResults(params, searching);
  useShortlistRefresh(results.therapists);
  const centre = useCentre(results.searchedPlace, params.flags.LocationSearchOutsideUK);
  // The place searched comes with the results, so there is none until a first search's results arrive; while the next
  // search loads, the results, and so the place, are still the last search's.
  const centreSettled = centre.settled && !results.query.isPending && !results.query.isPlaceholderData;
  const { pins, unplaced, placing, moving } = usePins(results.therapists, centre, params.flags.LocationSearchOutsideUK);
  // Kept by key, so a new search shows its results whichever tab was open.
  const [tabChoice, setTabChoice] = useState<{ fitKey: string; tab: ListTab }>();
  const tab = tabChoice?.fitKey === fitKey ? tabChoice.tab : "results";
  // Beside a search, the map shows whichever list is open, framing each afresh as its tab opens.
  const mapsShortlist = searching && tab === "shortlist";
  const shortlisted = useShortlistIf(mapsShortlist).map((entry) => entry.card);
  // A shortlist gathers therapists from any search, so their places are read with no centre to choose by or be too far
  // from, and as UK places, since an overseas reading with no centre could put a UK therapist abroad.
  const shortlistPins = usePins(shortlisted, NO_CENTRE, false);
  const mapView: MapView = mapsShortlist
    ? { label: "Map of your shortlist", fitKey: `${fitKey} shortlist`, centreSettled: true, pins: shortlistPins.pins, placing: shortlistPins.placing }
    : { label: "Map of results", fitKey, centre: centre.point, centreSettled, pins, marksShortlist: true, placing };
  // Kept by key, so the selection follows its pin as Load more adds to it; a new search clears it.
  const [selection, setSelection] = useState<{ fitKey: string; pinKey: string }>();
  const selected = selection?.fitKey === fitKey ? mapView.pins.find((pin) => pin.key === selection.pinKey) : undefined;
  const [highlight] = useState(createHighlight);
  // A new search's list can replace a hovered card without a pointerleave or blur, so the highlight ends with the search.
  useEffect(() => {
    highlight.set(undefined);
  }, [highlight, fitKey]);
  const [panelOpen, setPanelOpen] = useState(true);
  // Whether the filters are open beneath the search box over the map. Right of the prompt on wide screens they show
  // regardless, and stay open over the map when a tick or the keyword starts a search; a search for a place puts them away.
  const [filtersOpen, setFiltersOpen] = useState(!searching && wide);
  const [sheet, setSheet] = useState<SheetPosition>("full");
  const layout = searching ? "search" : wide ? "prompt beside filters" : "prompt";
  const [laidOutFor, setLaidOutFor] = useState(layout);
  if (laidOutFor !== layout) {
    setLaidOutFor(layout);
    // A search opens on its list.
    if (searching) setSheet("full");
    else setFiltersOpen(wide);
  }
  // The shortlist keeps its place apart from the results', under a key of its own.
  const scroll = useRememberedScroll(tab === "results" ? entry : `${entry} shortlist`, tab === "shortlist" || !searching || !results.query.isPending);
  const listRef = useRef<HTMLUListElement>(null);
  // Whether the list was showing when a pin was selected, so it can glide to the pin's entry rather than jump.
  const listShowing = useRef(false);
  const tabsRef = useRef<HTMLDivElement>(null);
  const wasSearching = useRef(searching);
  // On a phone the toolbar leaves the list for the map as a search begins, so the keyboard, dropped with the box it was in,
  // goes to the new search's open tab rather than the top of the page.
  useLayoutEffect(() => {
    if (searching && !wasSearching.current && document.activeElement === document.body) {
      tabsRef.current?.querySelector<HTMLElement>('[aria-selected="true"]')?.focus();
    }
    wasSearching.current = searching;
  }, [searching]);

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
      results={searching ? list : <NearPrompt wide={wide} />}
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
  const footer = tab === "results" ? <LoadMore results={results} listRef={listRef} placing={placing || moving} /> : undefined;
  const tabs = <ListTabs ref={tabsRef} />;
  const toolbar = (placement: Placement) => (
    <Toolbar
      placement={placement}
      params={params}
      onChange={change}
      drafts={drafts}
      wide={wide}
      // The side bar's toggle, left over the top left as the side bar hides, moves the toolbar aside.
      besideToggle={wide && searching && !panelOpen}
      filtersOpen={filtersOpen}
      onFiltersOpenChange={setFiltersOpen}
    />
  );

  // Before a search the list takes the page, as online's does, with the toolbar right of it on wide screens and atop it on
  // a phone; a search gives the page to the map, the list beside or over it. On wide screens the toolbar keeps its place in
  // the tree as it moves over the map, so what is typed, open or in focus in it stays; on a phone its filters' sheet does.
  return (
    <FiltersSheet phone={!wide} params={params} drafts={drafts}>
      {/* The tabs' root spans the page, around wherever their list and panels sit. */}
      <Tabs.Root value={tab} onValueChange={pickTab} asChild>
        <div className="group/tabs flex min-h-0 flex-1">
          {/* Apart from the list, which goes inert as it is put away over the map, and stays put as it moves between the side
              bar and the sheet. */}
          {searching && <ResultsStatus params={params} results={results} className="sr-only" />}
          {!searching ? (
            <ListColumn wide={wide} tabs={tabs} top={!wide && toolbar("list")} scroll={scroll}>
              {lists}
            </ListColumn>
          ) : (
            wide && (
              <ResultsPanel
                open={panelOpen}
                onOpenChange={setPanelOpen}
                tabs={tabs}
                masthead={<Masthead />}
                scrollRef={scroll.ref}
                onScroll={scroll.save}
                footer={footer}
              >
                {lists}
              </ResultsPanel>
            )
          )}
          {(searching || wide) && (
            <div className={cn("relative", searching ? "min-w-0 flex-1" : "w-96 shrink-0 border-l")}>
              {searching && (
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
              )}
              {toolbar(searching ? "map" : "aside")}
              {!wide && searching && (
                <ResultsSheet position={sheet} onPositionChange={setSheet} tabs={tabs} scrollRef={scroll.ref} onScroll={scroll.save} footer={footer}>
                  <Masthead className="pb-3" />
                  {lists}
                </ResultsSheet>
              )}
            </div>
          )}
        </div>
      </Tabs.Root>
    </FiltersSheet>
  );
}

/** Whether `params` have a place to search near. */
function placed(params: SearchParams): boolean {
  return params.text.Location !== "";
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

/** Where the toolbar stands: over the map, or before a search right of the list on wide screens and atop it on a phone. */
type Placement = "map" | "aside" | "list";

/**
 * The switch to online, search box, filters and active-filter chips. Over the map, the buttons the map offers once moved,
 * to search there or recentre, are placed to keep clear of it, so a change to its inset, width or height moves them too.
 * Beside the list the filters stay open, as online's do.
 */
function Toolbar({
  placement,
  params,
  onChange,
  drafts,
  wide,
  besideToggle,
  filtersOpen,
  onFiltersOpenChange,
}: ViewProps & {
  placement: Placement;
  drafts: SearchDrafts;
  besideToggle: boolean;
  filtersOpen: boolean;
  onFiltersOpenChange: (open: boolean) => void;
}) {
  const filtersId = useId();
  const ticked = tickedFilters(params);
  const overMap = placement === "map";
  return (
    <Collapsible open={wide && (placement === "aside" || filtersOpen)} asChild>
      <div
        className={cn(
          "flex flex-col items-start gap-2",
          placement !== "list" && "absolute inset-3 z-10",
          // Only the toolbar's own controls take the pointer; the map shows through the rest of it. It steps aside for the
          // side bar's toggle as the side bar slides, and in time with it.
          overMap && "pointer-events-none motion-safe:transition-[left] motion-safe:duration-200",
          // As wide as beside the list (a w-96 column less its border and p-3), so nothing in it shifts as it moves onto the
          // map and back.
          overMap && "lg:right-auto lg:w-[calc(24rem-1.5rem-1px)]",
          besideToggle && "left-14",
        )}
      >
        <Morph name="toolbar">
          <div className={cn("pointer-events-auto flex w-full flex-col gap-2 rounded-xl border bg-background p-2", overMap && "shadow-md")}>
            <ModeSwitch online={false} params={params} />
            <div className="flex items-start gap-2">
              {/* A search for a place puts the filters away to show where it is; ticks and the keyword leave them open for more. */}
              <Morph name="place">
                <SearchBox params={params} drafts={drafts} onPlaceSearch={() => onFiltersOpenChange(false)} className="min-w-0 flex-1" />
              </Morph>
              {wide ? (
                overMap && (
                  <FiltersButton
                    ticked={ticked}
                    aria-expanded={filtersOpen}
                    aria-controls={filtersOpen ? filtersId : undefined}
                    onClick={() => onFiltersOpenChange(!filtersOpen)}
                  />
                )
              ) : (
                <FiltersSheetButton ticked={ticked} />
              )}
            </div>
          </div>
        </Morph>
        <FilterChips
          params={params}
          onChange={onChange}
          // Only as wide as its chips, up to the toolbar's width, so it covers no more of the map than they do.
          className={cn("pointer-events-auto", !wide && "max-w-full flex-nowrap overflow-x-auto [&>li]:shrink-0")}
        />
        {/* Shrinks with the toolbar, scrolling the filters within. Its shadow is its own, as it clips the filters' as it unrolls. */}
        <CollapsibleContent className={cn("flex min-h-0 w-full flex-col rounded-xl", overMap && "shadow-lg")}>
          <FiltersSection
            id={filtersId}
            params={params}
            drafts={drafts}
            onClose={overMap ? () => onFiltersOpenChange(false) : undefined}
            className="pointer-events-auto"
          />
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
}

/** In place of the results until there is a place to search. */
function NearPrompt({ wide }: { wide: boolean }) {
  return (
    <Prompt ask="Start with where you are." className="py-10 sm:py-16">
      {wide ? (
        "Type a town, city or postcode in the box to the right to see the UKCP therapists nearest to it. The filters beneath"
      ) : (
        <>
          Type a town, city or postcode to see the UKCP therapists nearest to it. Filters <FiltersIcon />
        </>
      )}{" "}
      then narrow the list by what they help with, how they work, the languages they speak and more.
    </Prompt>
  );
}
