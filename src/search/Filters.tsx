import { SlidersHorizontal, X } from "lucide-react";
import { useState, type ComponentProps } from "react";
import type { SearchParams } from "@shared/query";
import type { FilterGroup } from "@shared/types";
import { IconButton } from "@/components/IconButton";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { FilterPanel } from "./FilterPanel";
import { TickedCount } from "./TickedCount";
import type { SearchDrafts } from "./useSearchDrafts";

type PanelProps = { params: SearchParams; drafts: SearchDrafts; groups?: FilterGroup[] };

/** The filters under their heading, which stays in view, with a close button when they can be put away. */
export function FiltersSection({ id, onClose, className, ...panel }: PanelProps & { id: string; onClose?: () => void; className?: string }) {
  return (
    <section aria-labelledby={`${id}-heading`} id={id} className={cn("flex min-h-0 flex-col overflow-hidden rounded-xl border bg-background", className)}>
      <div className="flex items-center justify-between gap-2 border-b p-3 pl-4">
        <h2 id={`${id}-heading`} className="font-semibold">
          Refine your search
        </h2>
        {onClose && (
          <Button type="button" variant="ghost" size="icon-sm" aria-label="Close filters" onClick={onClose}>
            <X aria-hidden />
          </Button>
        )}
      </div>
      <div className="min-h-0 overflow-y-auto p-4">
        <FilterPanel {...panel} />
      </div>
    </section>
  );
}

export function MobileFilters({ ticked, ...panel }: PanelProps & { ticked: number }) {
  const [open, setOpen] = useState(false);
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <FiltersButton ticked={ticked} />
      </SheetTrigger>
      <SheetContent side="left" className="gap-0">
        <SheetHeader className="border-b">
          <SheetTitle>Refine your search</SheetTitle>
        </SheetHeader>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 pt-4 pb-6">
          {/* Searching closes the sheet to show its results; ticks leave it open for more. */}
          <FilterPanel {...panel} onSearch={() => setOpen(false)} />
        </div>
      </SheetContent>
    </Sheet>
  );
}

/** With the number of ticked filters on its corner. */
export function FiltersButton({ ticked, className, ...props }: Omit<ComponentProps<typeof IconButton>, "label"> & { ticked: number }) {
  return (
    <IconButton label="Filters" variant="outline" className={cn("relative", className)} {...props}>
      <SlidersHorizontal aria-hidden />
      <TickedCount count={ticked} className="absolute -top-1.5 -right-1.5 h-4 min-w-4 px-1 text-[0.625rem]" />
    </IconButton>
  );
}
