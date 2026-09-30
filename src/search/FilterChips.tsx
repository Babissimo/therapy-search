import { X } from "lucide-react";
import type { SearchParams } from "@shared/query";
import { Morph } from "@/components/Morph";
import { Button } from "@/components/ui/button";
import { useLeaving } from "@/lib/useLeaving";
import { cn } from "@/lib/utils";
import { activeFilters } from "./activeFilters";

type Props = { params: SearchParams; onChange: (next: SearchParams) => void; className?: string };

/** Everything narrowing the search in one row, so a tick hidden in a closed group is still in view and one click away from undoing. */
export function FilterChips({ params, onChange, className }: Props) {
  const chips = useLeaving(activeFilters(params), (filter) => filter.key);
  // Mounted without chips too: a Morph that mounts as a tick adds the first would start an empty view transition.
  return (
    <Morph name="chips">
      {chips.length > 0 && (
        <ul aria-label="Active filters" className={cn("flex flex-wrap gap-2", className)}>
          {chips.map(({ key, item: filter, props }) => (
            <li
              key={key}
              {...props}
              className="fade-in-0 fade-out-0 zoom-in-90 zoom-out-90 motion-safe:data-entering:animate-in motion-safe:data-leaving:animate-out"
            >
              <Button
                variant="secondary"
                size="xs"
                className="h-auto min-h-6 rounded-full py-1 text-left whitespace-normal"
                aria-label={`Remove ${filter.label}`}
                onClick={() => onChange(filter.without)}
              >
                {filter.label}
                <X aria-hidden />
              </Button>
            </li>
          ))}
        </ul>
      )}
    </Morph>
  );
}
