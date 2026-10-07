import { Tabs } from "radix-ui";
import { useId, useLayoutEffect, useRef, type RefObject } from "react";
import { useLocation } from "react-router";
import { ONLINE_FILTER_GROUPS } from "@shared/filterGroups";
import { narrowsOnline, onlineSearch } from "@shared/online";
import type { SearchParams } from "@shared/query";
import { Morph, startMorph } from "@/components/Morph";
import { focusOnceShown, SkipLinks } from "@/layout/SkipLinks";
import { cn } from "@/lib/utils";
import { LazyShortlistTab } from "@/shortlist/LazyShortlistTab";
import { useShortlistRefresh } from "@/shortlist/useShortlist";
import { soughtTerms } from "./activeFilters";
import { FilterChips } from "./FilterChips";
import { FilterPanel } from "./FilterPanel";
import { FiltersSection, MobileFilters, UpdateResults } from "./Filters";
import { ListColumn } from "./ListColumn";
import { ListPanels, ListTabs, useTabbed, type ListTab } from "./ListTabs";
import { LoadMore } from "./LoadMore";
import { ModeSwitch } from "./ModeSwitch";
import { Prompt } from "./Prompt";
import { Results } from "./Results";
import { ResultsStatus } from "./ResultsStatus";
import { useResults } from "./useResults";
import { useSearchDrafts } from "./useSearchDrafts";
import { useRememberedScroll, useRememberedTab } from "./viewMemory";

type Props = { params: SearchParams; onChange: (next: SearchParams) => void; wide: boolean };

/** Therapists working online or by phone, wherever they are. With no place to map, the list takes the page, its filters to its right. */
export function OnlineView({ params, onChange, wide }: Props) {
  const { key: entry } = useLocation();
  const search = onlineSearch(params);
  // As Near me waits for a place, this waits for a filter, asking UKCP for nothing until then.
  const searching = narrowsOnline(params);
  const results = useResults(search, searching);
  const drafts = useSearchDrafts(params, (next) => {
    results.retrySame(onlineSearch(next));
    onChange(next);
  });
  // Ticks begin a search only once they narrow it; once one shows, any change goes, back to the prompt if need be.
  const firstSearch = searching ? undefined : narrowsOnline;
  useShortlistRefresh(results.therapists);
  const filtersId = useId();
  // A new search replaces the history entry, so it begins on the results.
  const [tab, setTab] = useRememberedTab(entry);
  const shortlistOpen = tab === "shortlist";
  const askRef = useRef<HTMLDivElement>(null);
  const tabbed = useTabbed(searching, tab, () => askRef.current);
  // The shortlist keeps its place apart from the results', under a key of its own.
  const scroll = useRememberedScroll(shortlistOpen ? `${entry} shortlist` : entry, shortlistOpen || !searching || !results.loading);
  const listRef = useRef<HTMLUListElement>(null);
  const filtersButton = useRef<HTMLButtonElement>(null);
  // The first group of filters, right of the list on wide screens or beneath the prompt on a phone before a search.
  const firstFilter = () => document.getElementById(filtersId)?.querySelector<HTMLElement>('[data-slot="accordion-trigger"]');
  const tabsRef = useRef<HTMLDivElement>(null);
  const wasSearching = useRef(searching);
  // On a phone the keyboard goes with what held it as a search begins or ends: Show results beneath the prompt gives way to
  // the results, so it goes to their tab, as Near me's place box does; the filters' sheet goes, so it goes to the filters
  // beneath the prompt.
  useLayoutEffect(() => {
    if (!wide && wasSearching.current !== searching && document.activeElement === document.body) {
      if (searching) tabsRef.current?.querySelector<HTMLElement>('[aria-selected="true"]')?.focus();
      else firstFilter()?.focus();
    }
    wasSearching.current = searching;
  }, [searching, wide]);

  const toolbar = (
    <Morph name="toolbar">
      <div className="flex flex-col gap-2 rounded-xl border bg-background p-2">
        <ModeSwitch online params={params} drafts={drafts} />
        <div className="flex items-center gap-2">
          <Morph name="place">
            {/* As tall as Near me's search box, so the one gives way to the other in a toolbar of one size. */}
            <p className="flex min-h-8 min-w-0 flex-1 items-center px-1 text-sm">Online or by phone, wherever you are</p>
          </Morph>
          {/* Before a search a phone sets the filters out beneath the prompt instead. */}
          {!wide && searching && <MobileFilters buttonRef={filtersButton} params={params} drafts={drafts} groups={ONLINE_FILTER_GROUPS} />}
        </div>
      </div>
    </Morph>
  );
  const chips = (
    <FilterChips
      params={params}
      onRemove={drafts.applyWithout}
      // The button opening the filters on a phone, or the first of the filters beside the list on wide screens.
      onEmptied={() => (filtersButton.current ?? firstFilter())?.focus()}
      className={cn(!wide && "flex-nowrap overflow-x-auto [&>li]:shrink-0")}
    />
  );
  const lists = (
    <ListPanels
      tab={tab}
      tabbed={tabbed}
      shortlist={<LazyShortlistTab sought={soughtTerms(search)} online />}
      results={
        searching ? (
          <>
            <Results params={search} asked={params} results={results} listRef={listRef} online />
            {/* The list is the page here, so the button comes at its end rather than holding a strip beneath it. */}
            <LoadMore results={results} listRef={listRef} atEnd />
          </>
        ) : (
          <div className="space-y-8">
            <OnlinePrompt wide={wide} askRef={askRef} />
            {!wide && (
              <div id={filtersId} className="space-y-6">
                <FilterPanel params={params} drafts={drafts} groups={ONLINE_FILTER_GROUPS} />
                <UpdateResults drafts={drafts} label="Show results" ready={firstSearch} />
              </div>
            )}
          </div>
        )
      }
    />
  );

  // The toolbar comes and goes with the shortlist, so the list glides into its place.
  const pickTab = (value: string) => startMorph(() => setTab(value as ListTab));
  // The filters come after the list on wide screens, and stand aside for the shortlist, so the results come forward with them.
  const skipToFilters = () => {
    if (shortlistOpen) pickTab("results");
    focusOnceShown(firstFilter);
  };

  return (
    <Tabs.Root value={tab} onValueChange={pickTab} asChild>
      <div className="group/tabs flex min-h-0 flex-1 print:block">
        {wide && <SkipLinks skips={[{ label: "Skip to the filters", onSkip: skipToFilters }]} />}
        {/* Apart from the results' panel, which is hidden while the shortlist's shows. There before a search starts, as a live
            region is heard only once it is there. */}
        <ResultsStatus params={search} results={results} online searching={searching} />
        <ListColumn
          wide={wide}
          tabs={tabbed && <ListTabs ref={tabsRef} />}
          top={
            <>
              {toolbar}
              {chips}
            </>
          }
          topHidden={shortlistOpen}
          scroll={scroll}
        >
          {lists}
        </ListColumn>
        {/* Right of the list, as Near me sets its toolbar and filters right of its results. Nothing in it acts on the
            shortlist, so it stands aside for it, hidden so what is open in it stays for the results. */}
        {wide && (
          <div hidden={shortlistOpen} className="flex w-96 shrink-0 flex-col gap-2 border-l p-3 print:hidden">
            {toolbar}
            {chips}
            <FiltersSection
              id={filtersId}
              params={params}
              drafts={drafts}
              groups={ONLINE_FILTER_GROUPS}
              footer={<UpdateResults drafts={drafts} label={searching ? undefined : "Show results"} ready={firstSearch} />}
            />
          </div>
        )}
      </div>
    </Tabs.Root>
  );
}

/** In place of the results until a filter narrows the search. The filters sit to its right on wide screens, beneath it on a phone. */
function OnlinePrompt({ wide, askRef }: { wide: boolean; askRef: RefObject<HTMLDivElement | null> }) {
  return (
    <Prompt askRef={askRef} ask="Start with what matters to you." toFilters={!wide} className={wide ? "py-10 sm:py-16" : "pt-6"}>
      Thousands of UKCP therapists work online or by phone. Choose a filter {wide ? "to the right" : "below"}, such as what they
      help with, how they work or the languages they speak, then show who fits. Type of session alone won't narrow them enough.
    </Prompt>
  );
}
