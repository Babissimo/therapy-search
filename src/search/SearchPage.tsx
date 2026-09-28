import { useState } from "react";
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
import { tickedIn } from "./state";
import { TickedCount } from "./TickedCount";
import { useResults } from "./useResults";
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
  return <SearchView params={params} onChange={update} />;
}

type ViewProps = { params: SearchParams; onChange: (next: SearchParams) => void };

function SearchView({ params, onChange }: ViewProps) {
  const results = useResults(params);
  return (
    <div className="grid gap-8 md:grid-cols-[minmax(0,1fr)_20rem]">
      <div className="space-y-6">
        <MobileFilters params={params} onChange={onChange} />
        <FilterChips params={params} onChange={onChange} />
        <Results params={params} results={results} />
      </div>
      <aside className="hidden md:block">
        <FilterPanel params={params} onChange={onChange} />
      </aside>
    </div>
  );
}

function MobileFilters({ params, onChange }: ViewProps) {
  const [open, setOpen] = useState(false);
  return (
    <Sheet open={open} onOpenChange={setOpen}>
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
          {/* Search closes the sheet to show its results; ticks leave it open for more. */}
          <FilterPanel params={params} onChange={onChange} onSearch={() => setOpen(false)} />
        </div>
      </SheetContent>
    </Sheet>
  );
}
