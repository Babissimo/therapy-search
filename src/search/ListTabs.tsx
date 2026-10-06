import { Bookmark, List } from "lucide-react";
import { useLayoutEffect, useState, type ReactNode, type Ref } from "react";
import { Morph } from "@/components/Morph";
import { TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Unfold } from "@/components/Unfold";
import { useLast } from "@/lib/useLast";
import { CountBadge } from "@/shortlist/CountBadge";
import { usePreloadShortlistTab } from "@/shortlist/LazyShortlistTab";
import { statusOf } from "@/shortlist/store";
import { useAnyShortlisted, useShortlist } from "@/shortlist/useShortlist";

export type ListTab = "results" | "shortlist";

/**
 * Between the results and the shortlist. The shortlist's count is read here, so a bookmark redraws the tabs rather than
 * the page. Those set aside aren't counted, the visitor having finished with them.
 */
export function ListTabs({ ref }: { ref?: Ref<HTMLDivElement> }) {
  const count = useShortlist().filter((entry) => statusOf(entry) !== "setAside").length;
  // The count as it last stood above none, for the badge to show as it folds away.
  const badge = useLast(count || undefined);
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
          {/* Pulled back over the trigger's gap, which the badge opens again inside what folds, so none is left once it has gone. */}
          <Unfold open={count > 0} across className="-ml-1.5">
            {badge !== undefined && <CountBadge count={badge} className="ml-1.5" />}
          </Unfold>
        </TabsTrigger>
      </TabsList>
    </Morph>
  );
}

/**
 * Whether the tabs show. Before a search the results are only the prompt, so there is nothing to choose between until
 * something is shortlisted; once the shortlist is open, the tabs stay until the visitor leaves it, emptied or not. Should
 * they fold away with the keyboard on one, it goes to `next`.
 */
export function useTabbed(searching: boolean, tab: ListTab, next: () => HTMLElement | null): boolean {
  const anyShortlisted = useAnyShortlisted();
  const tabbed = searching || anyShortlisted || tab === "shortlist";
  // Read as the page is drawn without them, while the tab with the keyboard is still there.
  const [fold, setFold] = useState<{ tabbed: boolean; from: Element | null }>({ tabbed, from: null });
  if (fold.tabbed !== tabbed) setFold({ tabbed, from: document.activeElement });
  useLayoutEffect(() => {
    if (!fold.tabbed && fold.from?.getAttribute("role") === "tab" && document.activeElement === document.body) next()?.focus();
  }, [fold]);
  return tabbed;
}

// The page's text size rather than the tabs' own, which is set for short text. A panel is a Tab stop of its own, so it
// shows a ring when it has focus.
const PANEL = "rounded-md text-base focus-visible:ring-3 focus-visible:ring-ring/50";

// Without tabs to name it, the results' panel is the page's content, neither a tab panel nor a Tab stop.
const UNTABBED = { role: undefined, "aria-labelledby": undefined, tabIndex: undefined };

/**
 * The tabs' two lists, mounted throughout and hidden here rather than shown by Radix a render after their tab, so a
 * panel's entries are there for the list's scroll to be restored or a pin's entry found. The shortlist's cards come and
 * go with their tab, which lets go of those removed while it was open. The results' panel stays one element as the tabs
 * come and go, keeping what is open, or has the keyboard, within it.
 */
export function ListPanels({ tab, tabbed, results, shortlist }: { tab: ListTab; tabbed: boolean; results: ReactNode; shortlist: ReactNode }) {
  return (
    <>
      <TabsContent value="results" forceMount hidden={tab !== "results"} className={PANEL} {...(!tabbed && UNTABBED)}>
        {results}
      </TabsContent>
      {tabbed && (
        <TabsContent value="shortlist" forceMount hidden={tab !== "shortlist"} className={PANEL}>
          {tab === "shortlist" && shortlist}
        </TabsContent>
      )}
    </>
  );
}
