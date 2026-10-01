import { X } from "lucide-react";
import type { SearchParams } from "@shared/query";
import { GlidingList } from "@/components/GlidingList";
import { Morph } from "@/components/Morph";
import { Button } from "@/components/ui/button";
import { useLeaving } from "@/lib/useLeaving";
import { cn } from "@/lib/utils";
import { activeFilters } from "./activeFilters";

type Props = { params: SearchParams; onRemove: (key: string) => void; className?: string };

/**
 * Everything narrowing the search on show in one row, so a tick hidden in a closed group is still in view and one click
 * away from undoing. A chip names its filter by key, so the page can search its draft without it.
 */
export function FilterChips({ params, onRemove, className }: Props) {
  const chips = useLeaving(activeFilters(params), (filter) => filter.key);
  // Mounted without chips too: a Morph that mounts as a tick adds the first would start an empty view transition.
  return (
    <Morph name="chips">
      {chips.length > 0 && (
        <GlidingList aria-label="Active filters" className={cn("flex flex-wrap gap-2", className)}>
          {chips.map(({ key, item: filter, props }) => (
            <li
              key={key}
              {...props}
              className="fade-in-0 fade-out-0 zoom-in-90 zoom-out-90 motion-safe:data-entering:animate-in motion-safe:data-leaving:animate-out"
            >
              {/* Filled, as a choice that is on. The secondary slate is the map tiles' own tint, light and dark, and sinks into them. */}
              <Button
                size="xs"
                className="h-auto min-h-6 rounded-full py-1 text-left whitespace-normal"
                aria-label={`Remove ${filter.label}`}
                onClick={() => onRemove(filter.key)}
              >
                {filter.label}
                <X aria-hidden />
              </Button>
            </li>
          ))}
        </GlidingList>
      )}
    </Morph>
  );
}
