import { Bookmark, List } from "lucide-react";
import type { ReactNode, Ref } from "react";
import { Morph } from "@/components/Morph";
import { Badge } from "@/components/ui/badge";
import { TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { therapistCount, useShortlist } from "@/shortlist/useShortlist";

export type ListTab = "results" | "shortlist";

/** Between the results and the shortlist. The shortlist's count is read here, so a bookmark redraws the tabs rather than the page. */
export function ListTabs({ ref }: { ref?: Ref<HTMLDivElement> }) {
  const count = useShortlist().length;
  return (
    <Morph name="list-tabs">
      <TabsList ref={ref}>
        <TabsTrigger value="results">
          <List data-icon="inline-start" aria-hidden />
          Results
        </TabsTrigger>
        <TabsTrigger value="shortlist">
          <Bookmark data-icon="inline-start" aria-hidden />
          Shortlist
          {count > 0 && (
            <Badge variant="secondary" className="h-4 min-w-4 px-1 text-[0.625rem]">
              <span aria-hidden>{count}</span>
              {/* The comma keeps the count apart from the tab's name when a screen reader runs their text together. */}
              <span className="sr-only">, {therapistCount(count)}</span>
            </Badge>
          )}
        </TabsTrigger>
      </TabsList>
    </Morph>
  );
}

// The page's text size rather than the tabs' own, which is set for short text. A panel is a Tab stop of its own, so it
// shows a ring when it has focus.
const PANEL = "rounded-md text-base focus-visible:ring-3 focus-visible:ring-ring/50";

/**
 * The tabs' two lists, mounted throughout and hidden here rather than shown by Radix a render after their tab, so a
 * panel's entries are there for the list's scroll to be restored or a pin's entry found. The shortlist's cards come and
 * go with their tab, which lets go of those removed while it was open.
 */
export function ListPanels({ tab, results, shortlist }: { tab: ListTab; results: ReactNode; shortlist: ReactNode }) {
  return (
    <>
      <TabsContent value="results" forceMount hidden={tab !== "results"} className={PANEL}>
        {results}
      </TabsContent>
      <TabsContent value="shortlist" forceMount hidden={tab !== "shortlist"} className={PANEL}>
        {tab === "shortlist" && shortlist}
      </TabsContent>
    </>
  );
}
