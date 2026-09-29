import { Loader2, LocateFixed, Search } from "lucide-react";
import { useId } from "react";
import { TEXT_MAX_LENGTH, type SearchParams } from "@shared/query";
import { IconButton } from "@/components/IconButton";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { useLocate } from "./useLocate";
import type { SearchDrafts } from "./useSearchDrafts";

type Props = { params: SearchParams; drafts: SearchDrafts; className?: string };

/** The location search, which can search the visitor's nearest postcode; either way it takes the typed keyword with it. */
export function SearchBox({ params, drafts, className }: Props) {
  const here = useLocate((postcode) => drafts.submitAt(params, postcode));
  const problemId = useId();
  return (
    <div className={cn("min-w-0", className)}>
      <form
        role="search"
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          drafts.submit(params);
        }}
      >
        <div className="relative min-w-0 flex-1">
          <Input
            aria-label="Location"
            aria-describedby={here.problem ? problemId : undefined}
            placeholder="Town or postcode"
            maxLength={TEXT_MAX_LENGTH}
            value={drafts.location}
            onChange={(e) => {
              drafts.setLocation(e.target.value);
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
              onClick={here.locate}
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
      {here.problem && (
        <p id={problemId} role="alert" className="px-1 pt-1.5 text-xs text-destructive">
          {here.problem}
        </p>
      )}
    </div>
  );
}
