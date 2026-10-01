import { Loader2, LocateFixed, Search } from "lucide-react";
import { useId, useRef, useState } from "react";
import { TEXT_MAX_LENGTH, toQuery, type SearchParams } from "@shared/query";
import { ErrorLine } from "@/components/ErrorLine";
import { IconButton } from "@/components/IconButton";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { useLocate } from "./useLocate";
import { useDraft, type SearchDrafts } from "./useSearchDrafts";

export const NO_PLACE = "Type a town or postcode to search.";

/** The box for a place, which a skip link sends the keyboard to. The page shows one at a time. */
export const SEARCH_BOX_ID = "search-place";

type Props = {
  params: SearchParams;
  drafts: SearchDrafts;
  /** Hears a search for a place, typed or located. */
  onPlaceSearch?: () => void;
  /** Hears the box, or the button that locates, taking focus: a sign a search for a place may follow. */
  onFocus?: () => void;
  /** Hears a place about to be searched, holding the search back, with the place in the box, when it answers true. */
  hold?: (place: string) => boolean;
  className?: string;
};

/**
 * The location search, which can search the visitor's nearest postcode; either way it takes the typed keyword and the
 * ticks waiting in the draft with it. With the box empty it asks for a place rather than searching everywhere.
 */
export function SearchBox({ params, drafts, onPlaceSearch, onFocus, hold, className }: Props) {
  const here = useLocate((postcode) => {
    if (hold?.(postcode)) {
      drafts.set("location", postcode);
      return;
    }
    drafts.applyAt(postcode);
    onPlaceSearch?.();
  });
  // Kept by search, so a new one, however it comes, takes the request for a place away.
  const [placeWanted, setPlaceWanted] = useState<string>();
  const search = toQuery(params);
  const wanting = placeWanted === search;
  const problem = wanting ? NO_PLACE : here.problem;
  const problemId = useId();
  const input = useRef<HTMLInputElement>(null);
  const location = useDraft(drafts, "location");
  return (
    <div className={cn("min-w-0", className)}>
      <form
        role="search"
        className="flex gap-2"
        onFocus={onFocus}
        onSubmit={(e) => {
          e.preventDefault();
          if (location.trim() === "") {
            setPlaceWanted(search);
            input.current?.focus();
            return;
          }
          if (hold?.(location.trim())) return;
          drafts.apply();
          onPlaceSearch?.();
        }}
      >
        <div className="relative min-w-0 flex-1">
          <Input
            ref={input}
            id={SEARCH_BOX_ID}
            aria-label="Location"
            aria-invalid={wanting || undefined}
            aria-describedby={problem ? problemId : undefined}
            placeholder="Town or postcode"
            maxLength={TEXT_MAX_LENGTH}
            value={location}
            onChange={(e) => {
              drafts.set("location", e.target.value);
              setPlaceWanted(undefined);
              here.dismiss();
            }}
            className={cn(here.supported && "pr-9 pointer-coarse:pr-2.5")}
          />
          {here.supported && (
            <IconButton
              label="Use my location"
              touchLabel
              variant="ghost"
              size="icon-sm"
              // Not disabled while locating, which would drop focus; a second press is ignored.
              aria-disabled={here.locating}
              onClick={() => {
                setPlaceWanted(undefined);
                here.locate();
              }}
              // In the box's end, or beneath the box on touch screens, where it is named on screen. Positioned either way, so
              // anything placed against the button stays on it rather than spreading over the box.
              className={cn(
                "absolute top-0.5 right-0.5 text-muted-foreground aria-disabled:opacity-50",
                "pointer-coarse:relative pointer-coarse:inset-auto pointer-coarse:mt-1",
              )}
            >
              {here.locating ? <Loader2 aria-hidden className="motion-safe:animate-spin" /> : <LocateFixed aria-hidden />}
            </IconButton>
          )}
        </div>
        <IconButton type="submit" label="Search">
          <Search aria-hidden />
        </IconButton>
      </form>
      <p aria-live="polite" className="sr-only">
        {here.locating ? "Finding your location" : ""}
      </p>
      {problem && (
        <ErrorLine id={problemId} className="px-1 pt-1.5">
          {problem}
        </ErrorLine>
      )}
    </div>
  );
}
