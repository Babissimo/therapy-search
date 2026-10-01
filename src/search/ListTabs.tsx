import { Bookmark, List } from "lucide-react";
import type { ReactNode, Ref } from "react";
import { Morph } from "@/components/Morph";
import { TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CountBadge } from "@/shortlist/CountBadge";
import { usePreloadShortlistTab } from "@/shortlist/LazyShortlistTab";
import { statusOf } from "@/shortlist/store";
import { useShortlist } from "@/shortlist/useShortlist";

export type ListTab = "results" | "shortlist";

/**
 * Between the results and the shortlist. The shortlist's count is read here, so a bookmark redraws the tabs rather than
 * the page. Those set aside aren't counted, the visitor having finished with them.
 */
export function ListTabs({ ref }: { ref?: Ref<HTMLDivElement> }) {
  const count = useShortlist().filter((entry) => statusOf(entry) !== "setAside").length;
  usePreloadShortlistTab();
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
          {count > 0 && <CountBadge count={count} />}
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
