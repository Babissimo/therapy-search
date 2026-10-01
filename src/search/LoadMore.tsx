import { ListPlus, Loader2, Plus, RotateCw } from "lucide-react";
import { useEffect, useRef, useState, type RefObject } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { SearchResults } from "./useResults";

type Props = {
  results: SearchResults;
  /** The results' entries, where the keyboard carries on once the last page is in. */
  listRef: RefObject<HTMLUListElement | null>;
  /** True while any loaded card's place, its office's postcode included, is still being looked up. */
  placing?: boolean;
  /** At the list's end, scrolling with it, rather than in a strip held beneath it. */
  atEnd?: boolean;
  /**
   * Given in the side bar, whose hiding leaves the button in view over the map, shrunk to its icon like the side bar's
   * toggle: true while the side bar is hidden.
   */
  folded?: boolean;
  /** The side bar's toggle, where the keyboard carries on once the last page is in while the list is hidden. */
  toggleRef?: RefObject<HTMLElement | null>;
};

/** The next page's button, with the error from a failed page above it. */
export function LoadMore({ results: { query }, listRef, placing = false, atEnd = false, folded, toggleRef }: Props) {
  // How many entries were listed when the button was pressed while focused, until that fetch settles.
  const focusFrom = useRef<number | null>(null);
  const [tip, setTip] = useState(false);
  const pages = query.data?.pages.length;
  useEffect(() => {
    const from = focusFrom.current;
    // A new card that joins others at its pin is drawn afresh in their entry, so the keyboard waits for the pins.
    if (from === null || query.isFetchingNextPage || placing) return;
    focusFrom.current = null;
    // The last page takes the button away, dropping focus to the page; the keyboard carries on from the first new entry,
    // or, with the list hidden, from the toggle that brings it back.
    const dropped = document.activeElement === null || document.activeElement === document.body;
    if (!query.hasNextPage && dropped) (folded ? toggleRef?.current : listRef.current?.children[from]?.querySelector("a"))?.focus();
  }, [pages, query.isFetchingNextPage, query.hasNextPage, placing, listRef, folded, toggleRef]);
  // A next page that failed is still to come, so this stays for its retry.
  if (!query.hasNextPage || query.isPlaceholderData) return null;
  const docked = folded !== undefined;
  const label = query.isFetchNextPageError ? "Try again" : "Load more";
  // Folded, a list beside the plus, so it reads apart from the map's zoom-in button.
  const Icon = query.isFetchingNextPage ? Loader2 : query.isFetchNextPageError ? RotateCw : folded ? ListPlus : Plus;
  // One button loads and retries, so keyboard focus stays on it through a failure.
  const button = (
    <Button
      type="button"
      variant="outline"
      className={cn(
        // Its content fades rather than the whole of it, which would let the map show through when folded.
        "aria-disabled:*:opacity-50",
        docked
          ? [
              // Against the side bar's outer box, so the clip that hides the rest leaves it in view, over its place in the
              // strip: as wide as the strip within (the side bar's w-96 less its border and p-4), or folded to an icon.
              "visible absolute bottom-4 left-4 z-10 motion-safe:duration-200 motion-reduce:transition-colors",
              folded ? "w-8 gap-0 shadow-md dark:bg-background dark:hover:bg-muted" : "w-[calc(22rem-1px)]",
            ]
          : "w-full",
      )}
      // Named apart from its text when docked, as the text hides when folded.
      aria-label={docked ? label : undefined}
      // Not disabled while loading, which would drop focus; a second press is ignored, as it would restart the fetch.
      aria-disabled={query.isFetchingNextPage}
      onClick={(event) => {
        if (query.isFetchingNextPage) return;
        focusFrom.current = document.activeElement === event.currentTarget ? (listRef.current?.children.length ?? 0) : null;
        query.fetchNextPage();
      }}
    >
      <Icon className={cn(query.isFetchingNextPage && "motion-safe:animate-spin")} aria-hidden />
      {/* Shrinks away when folded, then hides, so find in page passes over it. */}
      <span
        className={cn(
          docked && [
            "overflow-hidden motion-safe:transition-[max-width,opacity,visibility] motion-safe:duration-200",
            folded ? "invisible max-w-0 opacity-0" : "max-w-24",
          ],
        )}
      >
        {label}
      </span>
    </Button>
  );
  return (
    <>
      <div className={cn("space-y-3", atEnd ? "pt-4" : "border-t bg-background p-4")}>
        {query.isFetchNextPageError && (
          <Alert variant="destructive">
            <AlertDescription>{query.error?.message}</AlertDescription>
          </Alert>
        )}
        {docked ? <div className="h-8" /> : button}
      </div>
      {docked && (
        // Shut while the button shows its text, so it neither opens empty nor names content that isn't there.
        <Tooltip open={folded && tip} onOpenChange={setTip}>
          <TooltipTrigger asChild>{button}</TooltipTrigger>
          {/* Folded, the error's alert is hidden with the side bar, so this and the notice below say why a page failed. */}
          <TooltipContent side="right">{query.isFetchNextPageError ? query.error?.message : label}</TooltipContent>
        </Tooltip>
      )}
      <p aria-live="polite" className={cn("sr-only", docked && "visible")}>
        {query.isFetchingNextPage ? "Loading more results" : folded && query.isFetchNextPageError ? query.error?.message : ""}
      </p>
    </>
  );
}
