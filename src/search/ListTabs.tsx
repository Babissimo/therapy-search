import { Badge } from "@/components/ui/badge";
import { TabsList, TabsTrigger } from "@/components/ui/tabs";
import { therapistCount, useShortlist } from "@/shortlist/useShortlist";

export type ListTab = "results" | "shortlist";

/** The side bar's two lists. The shortlist's count is read here, so a bookmark redraws the tabs rather than the page. */
export function ListTabs({ searching }: { searching: boolean }) {
  const count = useShortlist().length;
  return (
    <TabsList>
      {/* Before a search there are no results to show. */}
      <TabsTrigger value="results" disabled={!searching}>
        Results
      </TabsTrigger>
      <TabsTrigger value="shortlist">
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
  );
}
