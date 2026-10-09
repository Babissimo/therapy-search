import { X } from "lucide-react";
import type { ComponentProps } from "react";
import type { SearchParams } from "@shared/query";
import { GlidingList } from "@/components/GlidingList";
import { Morph } from "@/components/Morph";
import { Button } from "@/components/ui/button";
import { useLeaving } from "@/lib/useLeaving";
import { cn } from "@/lib/utils";
import { activeFilters } from "./activeFilters";

type Props = {
  params: SearchParams;
  onRemove: (key: string) => void;
  /** Takes the keyboard from the last chip as it goes. */
  onEmptied?: () => void;
  className?: string;
};

/**
 * Everything narrowing the search on show in one row, so a tick hidden in a closed group is still in view and one click
 * away from undoing. A chip names its filter by key, so the page can search its draft without it.
 */
export function FilterChips({ params, onRemove, onEmptied, className }: Props) {
  const chips = useLeaving(activeFilters(params), (filter) => filter.key);

  // A chip pressed goes out of reach as it leaves, so the keyboard moves on to the chip after it, or the one before.
  function handOn(pressed: HTMLElement) {
    if (document.activeElement !== pressed) return;
    const staying = [...(pressed.closest("ul")?.querySelectorAll<HTMLElement>("li:not([inert]) > button") ?? [])];
    const at = staying.indexOf(pressed);
    const next = staying[at + 1] ?? staying[at - 1];
    if (next) next.focus();
    else onEmptied?.();
  }
  // Mounted without chips too: a Morph that mounts as a tick adds the first would start an empty view transition.
  return (
    <Morph name="chips">
      {chips.length > 0 && (
        // Padded on a touch screen for the chips' targets, which a row that scrolls would otherwise clip, and drawn out by as
        // much to keep its place.
        <GlidingList aria-label="Active filters" className={cn("flex flex-wrap gap-2 pointer-coarse:-my-1.5 pointer-coarse:gap-y-3 pointer-coarse:py-1.5", className)}>
          {chips.map(({ key, item: filter, props }) => (
            <li
              key={key}
              {...props}
              className="fade-in-0 fade-out-0 zoom-in-90 zoom-out-90 motion-safe:data-entering:animate-in motion-safe:data-leaving:animate-out"
            >
              <FilterChip
                label={filter.label}
                aria-label={`Remove ${filter.label}`}
                onClick={(event) => {
                  handOn(event.currentTarget);
                  onRemove(filter.key);
                }}
              />
            </li>
          ))}
        </GlidingList>
      )}
    </Morph>
  );
}

/** A filter as a chip: its name and a ×, pressed to search without it. */
export function FilterChip({ label, className, ...props }: ComponentProps<typeof Button> & { label: string }) {
  return (
    // Filled, as a choice that is on. The secondary slate is the map tiles' own tint, light and dark, and sinks into them.
    <Button size="xs" className={cn("h-auto min-h-6 rounded-full py-1 text-left whitespace-normal pointer-coarse:min-h-8", className)} {...props}>
      {label}
      <X aria-hidden />
    </Button>
  );
}
