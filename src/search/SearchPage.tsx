import { Tabs } from "radix-ui";
import { lazy, useEffect, useId, useLayoutEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { Link, useLocation, useMatch } from "react-router";
import { canonicalLocation } from "@shared/location";
import { toQuery, type SearchParams } from "@shared/query";
import { MapSlot } from "@/components/MapSlot";
import { Morph, startMorph } from "@/components/Morph";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent } from "@/components/ui/collapsible";
import { Masthead } from "@/layout/Masthead";
import { focusOnceShown, SkipLinks, type Skip } from "@/layout/SkipLinks";
import { useMediaQuery } from "@/lib/useMediaQuery";
import { cn } from "@/lib/utils";
import { LazyShortlistTab } from "@/shortlist/LazyShortlistTab";
import { useSetAsideOpen } from "@/shortlist/setAside";
import { statusOf } from "@/shortlist/store";
import { useShortlistIf, useShortlistRefresh } from "@/shortlist/useShortlist";
import { activeFilters, soughtTerms } from "./activeFilters";
import { FilterChips } from "./FilterChips";
import { FilterPanel } from "./FilterPanel";
import { FiltersButton, FiltersSection, FiltersSheet, FiltersSheetButton, UpdateResults } from "./Filters";
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
import { loadMap, warmMap } from "./prefetch";
import { Prompt } from "./Prompt";
import { Results } from "./Results";
import { ResultsPanel } from "./ResultsPanel";
import { ResultsStatus } from "./ResultsStatus";
import { coverOf, ResultsSheet, type SheetPosition } from "./ResultsSheet";
import { SEARCH_BOX_ID, SearchBox } from "./SearchBox";
import { placed, tickedFilters } from "./state";
import { useResults } from "./useResults";
import { useDraftFilters, useSearchDrafts, type SearchDrafts } from "./useSearchDrafts";
import { useSearchState } from "./useSearchState";
import { useRememberedScroll, useRememberedTab } from "./viewMemory";

// Fetched as the place box takes focus, so it is usually here by the time a first search's results are.
const MapPane = lazy(loadMap);

/** Wide enough for the results to sit beside the map rather than over it. */
const WIDE = "(min-width: 64rem)";

const NO_CENTRE = { settled: true };

/** Space left above a selected pin's entry as it scrolls into view. */
const REVEAL_GAP_PX = 8;

/** What the map shows of the list that is open. */
type MapView = Pick<MapPaneProps, "label" | "fitKey" | "centre" | "centreSettled" | "pins" | "marksShortlist" | "showsStatuses" | "placing">;

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
  // one looking nearby. Ticks and the keyword wait for one.
  const searching = placed(params);
  const results = useResults(params, searching);
  const drafts = useSearchDrafts(params, (next) => {
    results.retrySame(next);
    // Beginning or clearing a search sets the page out afresh, its pieces gliding to their new places.
    if (placed(next) === searching) onChange(next);
    else startMorph(() => onChange(next));
  });
  // The search, which the map's framings, and the selections on them, belong to.
  const fitKey = searching ? toQuery(params) : "";
  useShortlistRefresh(results.therapists);
  const centre = useCentre(results.searchedPlace, params.flags.LocationSearchOutsideUK);
  // The place searched comes with the results, so there is none until a first search's results arrive; while the next
  // search loads, the results, and so the place, are still the last search's.
  const centreSettled = centre.settled && !results.loading && !results.stale;
  const { pins, unplaced, placing, moving } = usePins(results.therapists, centre, params.flags.LocationSearchOutsideUK);
  // A new search replaces the history entry, so it begins on the results.
  const [tab, setTab] = useRememberedTab(entry);
  const shortlistOpen = tab === "shortlist";
  // Beside a search, the map shows whichever list is open, framing each afresh as its tab opens.
  const mapsShortlist = searching && shortlistOpen;
  const [setAsideOpen] = useSetAsideOpen();
  // As the tab lists them, the map shows those set aside only while their section is open.
  const shortlisted = useShortlistIf(mapsShortlist)
    .filter((entry) => setAsideOpen || statusOf(entry) !== "setAside")
    .map((entry) => entry.card);
  // A shortlist gathers therapists from any search, so their places are read with no centre to choose by or be too far
  // from, and as UK places, since an overseas reading with no centre could put a UK therapist abroad.
  const shortlistPins = usePins(shortlisted, NO_CENTRE, false);
  const mapView: MapView = mapsShortlist
    ? {
        label: "Map of your shortlist",
        fitKey: `${fitKey} shortlist`,
        centreSettled: true,
        pins: shortlistPins.pins,
        showsStatuses: true,
        placing: shortlistPins.placing,
      }
    : { label: "Map of results", fitKey, centre: centre.point, centreSettled, pins, marksShortlist: true, placing };
  // Kept by key, so the selection follows its pin as Load more adds to it; a new search, or the other list, clears it.
  const [selection, setSelection] = useState<{ fitKey: string; pinKey: string }>();
  const selected = selection?.fitKey === mapView.fitKey ? mapView.pins.find((pin) => pin.key === selection.pinKey) : undefined;
  const [highlight] = useState(createHighlight);
  // A new search's list can replace a hovered card without a pointerleave or blur, so the highlight ends with the search.
  useEffect(() => {
    highlight.set(undefined);
  }, [highlight, fitKey]);
  const [panelOpen, setPanelOpen] = useState(true);
  // Whether the filters are open beneath the search box over the map. Right of the prompt on wide screens they show
  // regardless, and stay open over the map when the keyword starts a search; a search for a place puts them away.
  const [filtersOpen, setFiltersOpen] = useState(!searching && wide);
  const [sheet, setSheet] = useState<SheetPosition>("full");
  // The place a search from the start was held back for while the page asks for a filter first, and whether the visitor
  // chose to search one without, which stops the asking for as long as Near me stays open.
  const [heldAt, setHeldAt] = useState<string>();
  const [unfiltered, setUnfiltered] = useState(false);
  const layout = searching ? "search" : wide ? "prompt beside filters" : "prompt";
  const [laidOutFor, setLaidOutFor] = useState(layout);
  if (laidOutFor !== layout) {
    setLaidOutFor(layout);
    // A search opens on its list.
    if (searching) {
      setSheet("full");
      setHeldAt(undefined);
    } else setFiltersOpen(wide);
  }
  // The shortlist keeps its place apart from the results', under a key of its own.
  const scroll = useRememberedScroll(shortlistOpen ? `${entry} shortlist` : entry, shortlistOpen || !searching || !results.loading);
  const listRef = useRef<HTMLUListElement>(null);
  const panelToggleRef = useRef<HTMLButtonElement>(null);
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
    setSelection({ fitKey: mapView.fitKey, pinKey: pin.key });
    listShowing.current = wide ? panelOpen : sheet !== "peek";
    if (wide) setPanelOpen(true);
    else if (sheet === "peek") setSheet("half");
  }

  function pickTab(value: string) {
    const pick = () => {
      setTab(value as ListTab);
      // A selected pin belongs to the list the map was showing, which lets it go.
      setSelection(undefined);
    };
    // Beside or above the prompt, the toolbar comes and goes with the shortlist, so the list glides into its place. Over
    // the map, nothing moves.
    if (!searching) startMorph(pick);
    else pick();
  }

  const aside = useRef<HTMLDivElement>(null);
  // Past the list and the map's pins to the search box, which comes after them; and to the list, put away or not. Before a
  // search on wide screens, past the prompt to the filters right of it, as online's start offers. Each brings the results'
  // tab forward, as the toolbar stands aside for the shortlist's.
  const skips: Skip[] = searching
    ? [
        {
          label: "Skip to the search box",
          onSkip: () => {
            if (tab !== "results") pickTab("results");
            focusOnceShown(() => document.getElementById(SEARCH_BOX_ID));
          },
        },
        {
          label: "Skip to the results",
          onSkip: () => {
            if (tab !== "results") pickTab("results");
            if (wide) setPanelOpen(true);
            else if (sheet === "peek") setSheet("half");
            // The results' panel, which ListPanels draws first.
            focusOnceShown(() => scroll.ref.current?.querySelector<HTMLElement>('[role="tabpanel"]'));
          },
        },
      ]
    : [
        {
          label: "Skip to the filters",
          onSkip: () => {
            if (tab !== "results") pickTab("results");
            focusOnceShown(() => aside.current?.querySelector<HTMLElement>('[data-slot="accordion-trigger"]'));
          },
        },
      ];

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
  // A place searched from the start with nothing that would make a chip waits for a filter, unless the visitor says not to.
  const hold = (place: string) => {
    if (unfiltered || activeFilters(drafts.search()).length > 0) return false;
    setHeldAt(place);
    return true;
  };
  const placeStep = (
    <PlaceStep
      params={params}
      drafts={drafts}
      hold={hold}
      onPlaceSearch={() => setFiltersOpen(false)}
      onUnfiltered={
        heldAt === undefined
          ? undefined
          : () => {
              setUnfiltered(true);
              drafts.applyAt(drafts.get("location").trim() || heldAt);
              setFiltersOpen(false);
            }
      }
    />
  );
  // Before a search, the filters come first and the place last: beside the prompt on wide screens, beneath it on a phone.
  const start = (
    <div className="space-y-8">
      {heldAt === undefined ? <NearPrompt wide={wide} /> : <FiltersFirst place={heldAt} wide={wide} />}
      {!wide && (
        <div className="space-y-6">
          <FilterPanel params={params} drafts={drafts} />
          {placeStep}
        </div>
      )}
    </div>
  );
  const lists = (
    <ListPanels
      tab={tab}
      results={searching ? list : start}
      shortlist={
        <LazyShortlistTab
          sought={soughtTerms(params)}
          pins={shortlistPins.pins}
          unplaced={shortlistPins.unplaced.length}
          selected={selected}
          onHighlight={highlight.set}
        />
      }
    />
  );
  const footer =
    tab === "results" ? (
      <LoadMore
        results={results}
        listRef={listRef}
        placing={placing || moving}
        folded={wide ? !panelOpen : undefined}
        toggleRef={panelToggleRef}
      />
    ) : undefined;
  const tabs = <ListTabs ref={tabsRef} />;
  const toolbar = (placement: Placement) => (
    <Toolbar
      placement={placement}
      params={params}
      drafts={drafts}
      wide={wide}
      // The side bar's toggle, left over the top left as the side bar hides, moves the toolbar aside.
      besideToggle={wide && searching && !panelOpen}
      // Nothing in it acts on the shortlist. Hidden rather than unmounted, it keeps what is typed or open in it for the results.
      hidden={shortlistOpen}
      filtersOpen={filtersOpen}
      onFiltersOpenChange={setFiltersOpen}
      placeStep={placement === "aside" ? placeStep : undefined}
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
          {(searching || wide) && <SkipLinks skips={skips} />}
          {/* Apart from the list, which goes inert as it is put away over the map, and stays put as it moves between the side
              bar and the sheet. There before a search starts, as a live region is heard only once it is there. */}
          <ResultsStatus params={params} results={results} searching={searching} />
          {!searching ? (
            <ListColumn wide={wide} tabs={tabs} top={!wide && toolbar("list")} topHidden={shortlistOpen} scroll={scroll}>
              {lists}
            </ListColumn>
          ) : (
            wide && (
              <ResultsPanel
                open={panelOpen}
                onOpenChange={setPanelOpen}
                toggleRef={panelToggleRef}
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
            // Before a search it holds the toolbar alone, so it goes with it, leaving the shortlist the page.
            <div
              ref={aside}
              hidden={!searching && shortlistOpen}
              className={cn("relative", searching ? "min-w-0 flex-1" : "w-96 shrink-0 border-l")}
            >
              {searching && (
                <MapSlot>
                  <MapPane
                    {...mapView}
                    entry={entry}
                    highlight={highlight}
                    selected={selected}
                    onSelect={select}
                    onDeselect={() => setSelection(undefined)}
                    onSearchArea={
                      mapsShortlist
                        ? undefined
                        : (postcode) => {
                            if (samePostcode(postcode, params.text.Location)) return false;
                            drafts.applyAt(postcode);
                            setFiltersOpen(false);
                            return true;
                          }
                    }
                    outsideUK={params.flags.LocationSearchOutsideUK}
                    coveredBelow={wide ? undefined : (height) => coverOf(sheet, height)}
                  />
                </MapSlot>
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
 * Beside the list the filters stay open, as online's do, with the place box, given as `placeStep`, at their foot.
 */
function Toolbar({
  placement,
  params,
  drafts,
  wide,
  besideToggle,
  hidden,
  filtersOpen,
  onFiltersOpenChange,
  placeStep,
}: Omit<ViewProps, "onChange"> & {
  placement: Placement;
  drafts: SearchDrafts;
  besideToggle: boolean;
  hidden: boolean;
  filtersOpen: boolean;
  onFiltersOpenChange: (open: boolean) => void;
  placeStep?: ReactNode;
}) {
  const filtersId = useId();
  const ticked = tickedFilters(useDraftFilters(drafts));
  const overMap = placement === "map";
  const filtersButton = useRef<HTMLButtonElement>(null);
  // Put away, the filters over the map search what was ticked in them, and take the keyboard with them when it is in them,
  // so it goes back to the button that opens them.
  const closeFilters = () => {
    if (document.getElementById(filtersId)?.contains(document.activeElement)) filtersButton.current?.focus();
    if (drafts.pending()) drafts.apply();
    onFiltersOpenChange(false);
  };
  // Fades in only on coming back, rather than as it first appears with the map.
  const [faded, setFaded] = useState(hidden);
  if (hidden && !faded) setFaded(true);
  return (
    <Collapsible open={wide && (placement === "aside" || filtersOpen)} asChild>
      <div
        hidden={hidden}
        // Out of reach while it fades.
        inert={hidden}
        className={cn(
          "flex flex-col items-start gap-2",
          placement !== "list" && "absolute inset-3 z-10",
          // Only the toolbar's own controls take the pointer; the map shows through the rest of it. It steps aside for the
          // side bar's toggle as the side bar slides, and in time with it. Coming and going in place, it fades.
          overMap &&
            "pointer-events-none motion-safe:transition-[left,opacity,display] motion-safe:transition-discrete motion-safe:duration-200 [&[hidden]]:opacity-0",
          overMap && faded && "starting:opacity-0",
          // As wide as beside the list (a w-96 column less its border and p-3), so nothing in it shifts as it moves onto the
          // map and back.
          overMap && "lg:right-auto lg:w-[calc(24rem-1.5rem-1px)]",
          besideToggle && "left-14",
        )}
        // Escape anywhere in the toolbar puts away the filters open over the map, unless it has just closed something open
        // within it, such as help, or cleared a search box, which says nothing of it.
        onKeyDown={(event) => {
          if (!(wide && overMap && filtersOpen) || event.key !== "Escape" || event.defaultPrevented) return;
          const box = event.target;
          if (box instanceof HTMLInputElement && box.type === "search" && box.value !== "") {
            // Chrome and Safari empty the box as Escape's own work, after this; a browser that leaves it filled closes them.
            setTimeout(() => box.value !== "" && closeFilters());
            return;
          }
          closeFilters();
        }}
      >
        <Morph name="toolbar">
          <div className={cn("pointer-events-auto flex w-full flex-col gap-2 rounded-xl border bg-background p-2", overMap && "shadow-md")}>
            <ModeSwitch online={false} params={params} drafts={drafts} />
            {/* Before a search the place box follows the filters instead. */}
            {overMap && (
              <div className="flex items-start gap-2">
                {/* A search for a place puts the filters away to show where it is; ticks and the keyword leave them open for more. */}
                <Morph name="place">
                  <SearchBox
                    params={params}
                    drafts={drafts}
                    onPlaceSearch={() => onFiltersOpenChange(false)}
                    onFocus={warmMap}
                    className="min-w-0 flex-1"
                  />
                </Morph>
                {wide ? (
                  <FiltersButton
                    ref={filtersButton}
                    ticked={ticked}
                    aria-expanded={filtersOpen}
                    aria-controls={filtersOpen ? filtersId : undefined}
                    onClick={() => (filtersOpen ? closeFilters() : onFiltersOpenChange(true))}
                  />
                ) : (
                  <FiltersSheetButton ref={filtersButton} ticked={ticked} />
                )}
              </div>
            )}
          </div>
        </Morph>
        <FilterChips
          params={params}
          onRemove={drafts.applyWithout}
          // The button opening the filters, or where there is none, the place box.
          onEmptied={() => (filtersButton.current ?? document.getElementById(SEARCH_BOX_ID))?.focus()}
          // Only as wide as its chips, up to the toolbar's width, so it covers no more of the map than they do.
          className={cn("pointer-events-auto", !wide && "max-w-full flex-nowrap overflow-x-auto [&>li]:shrink-0")}
        />
        {/* Shrinks with the toolbar, scrolling the filters within. Its shadow is its own, as it clips the filters' as it unrolls. */}
        <CollapsibleContent className={cn("flex min-h-0 w-full flex-col rounded-xl", overMap && "shadow-lg")}>
          <FiltersSection
            id={filtersId}
            params={params}
            drafts={drafts}
            onClose={overMap ? closeFilters : undefined}
            footer={overMap ? <UpdateResults drafts={drafts} /> : placeStep}
            className="pointer-events-auto"
          />
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
}

/** In place of the results until there is a place to search, asking for what matters before where. */
function NearPrompt({ wide }: { wide: boolean }) {
  return (
    <Prompt ask="Start with what matters to you." className={wide ? "py-10 sm:py-16" : "pt-6"}>
      Tick anything that matters to you {wide ? "in the filters to the right" : "below"}, then type a town, city or postcode
      {wide && " beneath them"} to see the UKCP therapists nearest to it.
    </Prompt>
  );
}

/** In place of the prompt while a place searched with nothing ticked waits for a filter. It takes the keyboard, so it is read out. */
function FiltersFirst({ place, wide }: { place: string; wide: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => ref.current?.focus(), [place]);
  return (
    // The help beneath is left out of what takes focus, so it isn't read out again for each place held.
    <Prompt
      askRef={ref}
      ask={
        <>
          Before we search near <span translate="no">{place}</span>
        </>
      }
      className={wide ? "py-10 sm:py-16" : "pt-6"}
    >
      A tick or two {wide ? "to the right" : "below"} keeps the list to people who suit you.
    </Prompt>
  );
}

type PlaceStepProps = {
  params: SearchParams;
  drafts: SearchDrafts;
  hold: (place: string) => boolean;
  onPlaceSearch: () => void;
  /** Searches the place in the box with no filters, offered while a place is held back and nothing is ticked since. */
  onUnfiltered?: () => void;
};

/**
 * The place box at the foot of the filters before a first search. Unlike the toolbar's box over the map it has no Morph:
 * paired, the switch to online would glide it into that view's toolbar.
 */
function PlaceStep({ params, drafts, hold, onPlaceSearch, onUnfiltered }: PlaceStepProps) {
  const filtered = useSyncExternalStore(drafts.subscribe, () => activeFilters(drafts.search()).length > 0);
  return (
    <div className="space-y-2">
      <p className="text-sm font-medium">Where are you?</p>
      <SearchBox params={params} drafts={drafts} hold={hold} onPlaceSearch={onPlaceSearch} onFocus={warmMap} />
      {onUnfiltered && !filtered && (
        <Button type="button" variant="link" size="sm" className="h-auto px-0" onClick={onUnfiltered}>
          Search without filters
        </Button>
      )}
    </div>
  );
}
