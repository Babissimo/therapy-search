import { SlidersHorizontal } from "lucide-react";
import { Link } from "react-router";
import { OPTIONS } from "@shared/options";
import type { SearchParams } from "@shared/query";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { FilterChips } from "./FilterChips";
import { FilterPanel } from "./FilterPanel";
import { Results } from "./Results";
import { SearchBar } from "./SearchBar";
import { tickedIn } from "./state";
import { TickedCount } from "./TickedCount";
import { useSearchState } from "./useSearchState";

export function SearchPage() {
  const { params, error, update } = useSearchState();
  if (!params) {
    return (
      <Alert variant="destructive">
        <AlertDescription>
          This search link isn't valid: {error?.message}.{" "}
          <Link to="/" className="underline">
            Start a new search
          </Link>
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="grid gap-8 md:grid-cols-[minmax(0,1fr)_20rem]">
      <div className="space-y-6">
        <SearchBar key={`${params.text.HelpWith}|${params.text.Location}`} params={params} onChange={update} />
        <MobileFilters params={params} onChange={update} />
        <FilterChips params={params} onChange={update} />
        <Results params={params} onChange={update} />
      </div>
      <aside className="hidden md:block">
        <FilterPanel key={panelKey(params)} params={params} onChange={update} />
      </aside>
    </div>
  );
}

function MobileFilters({ params, onChange }: { params: SearchParams; onChange: (next: SearchParams) => void }) {
  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="outline" className="md:hidden">
          <SlidersHorizontal aria-hidden />
          Refine your search
          <TickedCount count={OPTIONS.groups.reduce((sum, group) => sum + tickedIn(params, group), 0)} />
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Refine your search</SheetTitle>
        </SheetHeader>
        <div className="px-4 pb-6">
          <FilterPanel key={panelKey(params)} params={params} onChange={onChange} />
        </div>
      </SheetContent>
    </Sheet>
  );
}

/** Re-keying on the values the panel drafts locally resets those drafts when the URL changes. */
function panelKey(params: SearchParams): string {
  return `${params.text.KeywordFilter}|${params.distance}`;
}
