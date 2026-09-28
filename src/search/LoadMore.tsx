import { Loader2 } from "lucide-react";
import { useEffect, useRef, type RefObject } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import type { SearchResults } from "./useResults";

type Props = {
  results: SearchResults;
  /** The results' cards, where the keyboard carries on once the last page is in. */
  listRef: RefObject<HTMLUListElement | null>;
};

/** The next page's button, for beneath the list, with the error from a failed page above it. */
export function LoadMore({ results: { query, therapists }, listRef }: Props) {
  // How many cards were listed when the button was pressed while focused, until that fetch settles.
  const focusFrom = useRef<number | null>(null);
  const pages = query.data?.pages.length;
  useEffect(() => {
    const from = focusFrom.current;
    if (from === null || query.isFetchingNextPage) return;
    focusFrom.current = null;
    // The last page takes the button away, dropping focus to the page; the keyboard carries on from the first new card.
    const dropped = document.activeElement === null || document.activeElement === document.body;
    if (!query.hasNextPage && dropped) listRef.current?.children[from]?.querySelector("a")?.focus();
  }, [pages, query.isFetchingNextPage, query.hasNextPage, listRef]);
  // A next page that failed is still to come, so this stays for its retry.
  if (!query.hasNextPage || query.isPlaceholderData) return null;
  return (
    <div className="space-y-3 border-t bg-background p-4">
      {query.isFetchNextPageError && (
        <Alert variant="destructive">
          <AlertDescription>{query.error?.message}</AlertDescription>
        </Alert>
      )}
      {/* One button loads and retries, so keyboard focus stays on it through a failure. */}
      <Button
        type="button"
        variant="outline"
        className="w-full aria-disabled:opacity-50"
        // Not disabled while loading, which would drop focus; a second press is ignored, as it would restart the fetch.
        aria-disabled={query.isFetchingNextPage}
        onClick={(event) => {
          if (query.isFetchingNextPage) return;
          focusFrom.current = document.activeElement === event.currentTarget ? therapists.length : null;
          query.fetchNextPage();
        }}
      >
        {query.isFetchingNextPage && <Loader2 className="animate-spin" aria-hidden />}
        {query.isFetchNextPageError ? "Try again" : "Load more"}
      </Button>
      <p aria-live="polite" className="sr-only">
        {query.isFetchingNextPage ? "Loading more results" : ""}
      </p>
    </div>
  );
}
