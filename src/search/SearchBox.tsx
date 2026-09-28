import { TEXT_MAX_LENGTH, type SearchParams } from "@shared/query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { withDistance } from "./state";
import type { SearchDrafts } from "./useSearchDrafts";

type Props = { params: SearchParams; drafts: SearchDrafts; className?: string };

/** The location search; it takes the typed keyword and distance with it. */
export function SearchBox({ params, drafts, className }: Props) {
  return (
    <form
      role="search"
      className={cn("flex gap-2", className)}
      onSubmit={(e) => {
        e.preventDefault();
        drafts.submit(withDistance(params, drafts.distance));
      }}
    >
      <Input
        aria-label="Location"
        placeholder="Town or postcode"
        maxLength={TEXT_MAX_LENGTH}
        value={drafts.location}
        onChange={(e) => drafts.setLocation(e.target.value)}
      />
      <Button type="submit">Search</Button>
    </form>
  );
}
