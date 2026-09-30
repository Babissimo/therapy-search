import { Tabs } from "radix-ui";
import { useId, useRef, useState } from "react";
import { useLocation } from "react-router";
import { toQuery, type SearchParams } from "@shared/query";
import { Morph } from "@/components/Morph";
import { cn } from "@/lib/utils";
import { ShortlistTab } from "@/shortlist/ShortlistTab";
import { useShortlistRefresh } from "@/shortlist/useShortlist";
import { soughtTerms } from "./activeFilters";
import { FilterChips } from "./FilterChips";
import { ONLINE_FILTER_GROUPS } from "./filterGroups";
import { FiltersSection, MobileFilters } from "./Filters";
import { ListColumn } from "./ListColumn";
import { ListPanels, ListTabs, type ListTab } from "./ListTabs";
import { LoadMore } from "./LoadMore";
import { ModeSwitch } from "./ModeSwitch";
import { narrowsOnline, onlineSearch } from "./online";
import { FiltersIcon, Prompt } from "./Prompt";
import { Results } from "./Results";
import { tickedFilters } from "./state";
import { useResults } from "./useResults";
import { useSearchDrafts } from "./useSearchDrafts";
import { useRememberedScroll } from "./viewMemory";

type Props = { params: SearchParams; onChange: (next: SearchParams) => void; wide: boolean };

/** Therapists working online or by phone, wherever they are. With no place to map, the list takes the page, its filters to its right. */
export function OnlineView({ params, onChange, wide }: Props) {
  const { key: entry } = useLocation();
  const drafts = useSearchDrafts(params, onChange);
  const search = onlineSearch(params);
  // As Near me waits for a place, this waits for a filter, asking UKCP for nothing until then.
  const searching = narrowsOnline(params);
  const results = useResults(search, searching);
  useShortlistRefresh(results.therapists);
  const filtersId = useId();
  // Kept by search, so a new one shows its results whichever tab was open.
  const query = toQuery(params);
  const [tabChoice, setTabChoice] = useState<{ query: string; tab: ListTab }>();
  const tab = tabChoice?.query === query ? tabChoice.tab : "results";
  // The shortlist keeps its place apart from the results', under a key of its own.
  const scroll = useRememberedScroll(tab === "results" ? entry : `${entry} shortlist`, tab === "shortlist" || !searching || !results.query.isPending);
  const listRef = useRef<HTMLUListElement>(null);

  const toolbar = (
    <Morph name="toolbar">
      <div className="flex flex-col gap-2 rounded-xl border bg-background p-2">
        <ModeSwitch online params={params} />
        <div className="flex items-center gap-2">
          <Morph name="place">
            {/* As tall as Near me's search box, so the one gives way to the other in a toolbar of one size. */}
            <p className="flex min-h-8 min-w-0 flex-1 items-center px-1 text-sm">Online or by phone, wherever you are</p>
          </Morph>
          {!wide && <MobileFilters params={params} drafts={drafts} groups={ONLINE_FILTER_GROUPS} ticked={tickedFilters(params)} />}
        </div>
      </div>
    </Morph>
  );
  const chips = <FilterChips params={params} onChange={onChange} className={cn(!wide && "flex-nowrap overflow-x-auto [&>li]:shrink-0")} />;
  const lists = (
    <ListPanels
      tab={tab}
      shortlist={<ShortlistTab sought={soughtTerms(search)} online />}
      results={
        searching ? (
          <>
            <Results params={search} results={results} listRef={listRef} online />
            {/* The list is the page here, so the button comes at its end rather than holding a strip beneath it. */}
            <LoadMore results={results} listRef={listRef} atEnd />
          </>
        ) : (
          <OnlinePrompt wide={wide} />
        )
      }
    />
  );

  return (
    <Tabs.Root value={tab} onValueChange={(value) => setTabChoice({ query, tab: value as ListTab })} asChild>
      <div className="group/tabs flex min-h-0 flex-1">
        <ListColumn
          wide={wide}
          tabs={<ListTabs />}
          top={
            <>
              {toolbar}
              {chips}
            </>
          }
          scroll={scroll}
        >
          {lists}
        </ListColumn>
        {/* Right of the list, as Near me sets its toolbar and filters right of its results. */}
        {wide && (
          <div className="flex w-96 shrink-0 flex-col gap-2 border-l p-3">
            {toolbar}
            {chips}
            <FiltersSection id={filtersId} params={params} drafts={drafts} groups={ONLINE_FILTER_GROUPS} />
          </div>
        )}
      </div>
    </Tabs.Root>
  );
}

/** In place of the results until a filter narrows the search. The filters sit to its right on wide screens, behind their button otherwise. */
function OnlinePrompt({ wide }: { wide: boolean }) {
  return (
    <Prompt ask="Start with what matters to you." className="py-10 sm:py-16">
      Thousands of UKCP therapists work online or by phone.{" "}
      {wide ? (
        "Choose a filter to the right"
      ) : (
        <>
          Open Filters <FiltersIcon /> and choose one
        </>
      )}
      , such as what they help with, how they work or the languages they speak, to see who fits. Type of Session alone won't narrow them enough.
    </Prompt>
  );
}
