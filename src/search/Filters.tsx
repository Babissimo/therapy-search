import { SlidersHorizontal, X } from "lucide-react";
import { useState, useSyncExternalStore, type ComponentProps, type ReactNode, type Ref } from "react";
import type { SearchParams } from "@shared/query";
import type { FilterGroup } from "@shared/types";
import { IconButton } from "@/components/IconButton";
import { Morph } from "@/components/Morph";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetFooter, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { FilterPanel } from "./FilterPanel";
import { tickedFilters } from "./state";
import { TickedCount } from "./TickedCount";
import { useDraftFilters, type SearchDrafts } from "./useSearchDrafts";

type PanelProps = { params: SearchParams; drafts: SearchDrafts; groups?: FilterGroup[] };

/** The filters under their heading, which stays in view, with a close button when they can be put away and a footer beneath. */
export function FiltersSection({
  id,
  onClose,
  footer,
  className,
  ...panel
}: PanelProps & { id: string; onClose?: () => void; footer?: ReactNode; className?: string }) {
  return (
    <Morph name="filters">
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
        {footer && <div className="border-t p-3">{footer}</div>}
      </section>
    </Morph>
  );
}

export function MobileFilters({ buttonRef, ...panel }: PanelProps & { buttonRef?: Ref<HTMLButtonElement> }) {
  return (
    <FiltersSheet phone {...panel}>
      <FiltersSheetButton ref={buttonRef} ticked={tickedFilters(useDraftFilters(panel.drafts))} />
    </FiltersSheet>
  );
}

/**
 * The filters in a sheet from the right on a phone, opened by a FiltersSheetButton anywhere within it. The sheet keeps its
 * place in the tree however far its button moves about the page, so it stays open, and in use, as the button moves. It
 * covers the list, so it searches what was ticked in it as it is put away, by its button or otherwise. A view offers it only
 * once there is a search to show; before then its filters sit in the list.
 */
export function FiltersSheet({ phone, children, ...panel }: PanelProps & { phone: boolean; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  // Wide screens have no sheet, so widening puts it away, leaving its ticks waiting for the filters there.
  if (open && !phone) setOpen(false);
  const openChange = (next: boolean) => {
    if (!next && panel.drafts.pending()) panel.drafts.apply();
    setOpen(next);
  };
  return (
    <Sheet open={open} onOpenChange={openChange}>
      {children}
      {phone && (
        <SheetContent side="right" className="gap-0">
          <SheetHeader className="border-b">
            <SheetTitle>Refine your search</SheetTitle>
          </SheetHeader>
          <div className="min-h-0 flex-1 overflow-y-auto px-4 pt-4 pb-6">
            {/* Searching closes the sheet to show its results; ticks leave it open for more. */}
            <FilterPanel {...panel} onSearch={() => setOpen(false)} />
          </div>
          <SheetFooter className="border-t">
            <Button type="button" onClick={() => openChange(false)}>
              Show results
            </Button>
          </SheetFooter>
        </SheetContent>
      )}
    </Sheet>
  );
}

/** Opens the FiltersSheet it is within. */
export function FiltersSheetButton({ ticked, ref }: { ticked: number; ref?: Ref<HTMLButtonElement> }) {
  return (
    <SheetTrigger asChild>
      <FiltersButton ref={ref} ticked={ticked} />
    </SheetTrigger>
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

/**
 * Searches what the draft holds, offered while that differs from the search on show and `ready` allows it. It stays in
 * place, marked unavailable, when there is nothing to search, so the keyboard keeps its place as a search begins.
 */
export function UpdateResults({ drafts, label = "Update results", ready }: { drafts: SearchDrafts; label?: string; ready?: (draft: SearchParams) => boolean }) {
  const offered = useSyncExternalStore(drafts.subscribe, () => drafts.pending() && (ready?.(drafts.search()) ?? true));
  return (
    <Button type="button" aria-disabled={!offered || undefined} onClick={offered ? drafts.apply : undefined} className="w-full aria-disabled:opacity-50">
      {label}
    </Button>
  );
}
