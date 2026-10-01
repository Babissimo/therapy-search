import { Loader2, LocateFixed, Search } from "lucide-react";
import { useId, useRef, useState } from "react";
import { TEXT_MAX_LENGTH, toQuery, type SearchParams } from "@shared/query";
import { ErrorLine } from "@/components/ErrorLine";
import { IconButton } from "@/components/IconButton";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { useLocate } from "./useLocate";
import type { SearchDrafts } from "./useSearchDrafts";

export const NO_PLACE = "Type a town or postcode to search.";

type Props = {
  params: SearchParams;
  drafts: SearchDrafts;
  /** Hears a search for a place, typed or located. */
  onPlaceSearch?: () => void;
  className?: string;
};

/**
 * The location search, which can search the visitor's nearest postcode; either way it takes the typed keyword with it.
 * With the box empty it asks for a place rather than searching everywhere.
 */
export function SearchBox({ params, drafts, onPlaceSearch, className }: Props) {
  const here = useLocate((postcode) => {
    drafts.submitAt(params, postcode);
    onPlaceSearch?.();
  });
  // Kept by search, so a new one, however it comes, takes the request for a place away.
  const [placeWanted, setPlaceWanted] = useState<string>();
  const search = toQuery(params);
  const wanting = placeWanted === search;
  const problem = wanting ? NO_PLACE : here.problem;
  const problemId = useId();
  const input = useRef<HTMLInputElement>(null);
  return (
    <div className={cn("min-w-0", className)}>
      <form
        role="search"
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (drafts.location.trim() === "") {
            setPlaceWanted(search);
            input.current?.focus();
            return;
          }
          drafts.submit(params);
          onPlaceSearch?.();
        }}
      >
        <div className="relative min-w-0 flex-1">
          <Input
            ref={input}
            aria-label="Location"
            aria-invalid={wanting || undefined}
            aria-describedby={problem ? problemId : undefined}
            placeholder="Town or postcode"
            maxLength={TEXT_MAX_LENGTH}
            value={drafts.location}
            onChange={(e) => {
              drafts.setLocation(e.target.value);
              setPlaceWanted(undefined);
              here.dismiss();
            }}
            className={cn(here.supported && "pr-9")}
          />
          {here.supported && (
            <IconButton
              label="Use my location"
              variant="ghost"
              size="icon-sm"
              // Not disabled while locating, which would drop focus; a second press is ignored.
              aria-disabled={here.locating}
              onClick={() => {
                setPlaceWanted(undefined);
                here.locate();
              }}
              className="absolute top-0.5 right-0.5 text-muted-foreground aria-disabled:opacity-50"
            >
              {here.locating ? <Loader2 aria-hidden className="animate-spin" /> : <LocateFixed aria-hidden />}
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
