import { Video } from "lucide-react";
import { Tabs } from "radix-ui";
import { useId, useRef, useState } from "react";
import { useLocation } from "react-router";
import { toQuery, type SearchParams } from "@shared/query";
import { Masthead } from "@/layout/Masthead";
import { cn } from "@/lib/utils";
import { ShortlistTab } from "@/shortlist/ShortlistTab";
import { useShortlistRefresh } from "@/shortlist/useShortlist";
import { soughtTerms } from "./activeFilters";
import { FilterChips } from "./FilterChips";
import { ONLINE_FILTER_GROUPS } from "./filterGroups";
import { FiltersSection, MobileFilters } from "./Filters";
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

/** Therapists working online or by phone, wherever they are. With no place to map, the list takes the page, its filters beside it. */
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
    <div className="flex flex-col gap-2 rounded-xl border bg-background p-2">
      <ModeSwitch online params={params} />
      <div className="flex items-center gap-2">
        <p className="flex min-w-0 flex-1 items-center gap-2 px-1 text-sm">
          <Video aria-hidden className="size-4 shrink-0 text-muted-foreground" />
          Online or by phone, wherever you are
        </p>
        {!wide && <MobileFilters params={params} drafts={drafts} groups={ONLINE_FILTER_GROUPS} ticked={tickedFilters(params)} />}
      </div>
    </div>
  );
  const chips = <FilterChips params={params} onChange={onChange} className={cn(!wide && "flex-nowrap overflow-x-auto [&>li]:shrink-0")} />;
  const tabs = <ListTabs searching />;
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
    <>
      {wide && <Masthead className="border-b px-4 py-3" />}
      <div className="flex min-h-0 flex-1">
        {wide && (
          <div className="flex w-96 shrink-0 flex-col gap-2 border-r p-3">
            {toolbar}
            {chips}
            <FiltersSection id={filtersId} params={params} drafts={drafts} groups={ONLINE_FILTER_GROUPS} />
          </div>
        )}
        {/* The list is positioned so that visually hidden text is placed inside it rather than stretching the page. */}
        <Tabs.Root value={tab} onValueChange={(value) => setTabChoice({ query, tab: value as ListTab })} asChild>
          <section aria-label="Results and shortlist" className="group/tabs relative flex min-w-0 flex-1 flex-col">
            {wide ? (
              <>
                <div className="border-b px-4 py-2">
                  <div className="mx-auto max-w-2xl">{tabs}</div>
                </div>
                <div ref={scroll.ref} onScroll={(e) => scroll.save(e.currentTarget.scrollTop)} className="relative min-h-0 flex-1 overflow-y-auto p-4">
                  <div className="mx-auto max-w-2xl">{lists}</div>
                </div>
              </>
            ) : (
              <>
                {/* On a phone the site's name and the toolbar scroll away with the list, leaving it the screen; its tabs stay. */}
                <div ref={scroll.ref} onScroll={(e) => scroll.save(e.currentTarget.scrollTop)} className="relative min-h-0 flex-1 overflow-y-auto">
                  <Masthead className="border-b px-4 py-3" />
                  <div className="space-y-2 p-3">
                    {toolbar}
                    {chips}
                  </div>
                  <div className="sticky top-0 z-10 border-b bg-background px-4 py-2">{tabs}</div>
                  <div className="p-4">{lists}</div>
                </div>
              </>
            )}
          </section>
        </Tabs.Root>
      </div>
    </>
  );
}

/** In place of the results until a filter narrows the search. The filters sit beside it on wide screens, behind their button otherwise. */
function OnlinePrompt({ wide }: { wide: boolean }) {
  return (
    <Prompt ask="Choose a filter to see the UKCP therapists who work online or by phone." className="py-10 sm:py-16">
      {wide ? (
        "The filters"
      ) : (
        <>
          Filters <FiltersIcon />
        </>
      )}{" "}
      narrow the search by what therapists help with, how they work, the languages they speak and more. Thousands work online or by phone, so choosing
      between the two isn't enough on its own.
    </Prompt>
  );
}
