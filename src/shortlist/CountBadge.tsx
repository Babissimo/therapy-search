import { Badge } from "@/components/ui/badge";
import { therapistCount } from "./useShortlist";

/** A count of therapists beside the name of a tab or section, read out in full to a screen reader. */
export function CountBadge({ count }: { count: number }) {
  return (
    <Badge variant="secondary" className="h-4 min-w-4 px-1 text-[0.625rem]">
      <span aria-hidden>{count}</span>
      {/* The comma keeps the count apart from the name beside it when a screen reader runs their text together. */}
      <span className="sr-only">, {therapistCount(count)}</span>
    </Badge>
  );
}
