import { X } from "lucide-react";
import { useRef } from "react";
import type { SearchParams } from "@shared/query";
import { Morph } from "@/components/Morph";
import { Button } from "@/components/ui/button";
import { useLeaving } from "@/lib/useLeaving";
import { cn } from "@/lib/utils";
import { activeFilters } from "./activeFilters";

type Props = {
  params: SearchParams;
  onChange: (next: SearchParams) => void;
  /** Takes the keyboard from the last chip as it goes. */
  onEmptied?: () => void;
  className?: string;
};

/** Everything narrowing the search in one row, so a tick hidden in a closed group is still in view and one click away from undoing. */
export function FilterChips({ params, onChange, onEmptied, className }: Props) {
  const chips = useLeaving(activeFilters(params), (filter) => filter.key);
  const list = useRef<HTMLUListElement>(null);

  // A chip pressed goes out of reach as it leaves, so the keyboard moves on to the chip after it, or the one before.
  function handOn(pressed: HTMLElement) {
    if (document.activeElement !== pressed) return;
    const staying = [...(list.current?.querySelectorAll<HTMLElement>("li:not([inert]) > button") ?? [])];
    const at = staying.indexOf(pressed);
    const next = staying[at + 1] ?? staying[at - 1];
    if (next) next.focus();
    else onEmptied?.();
  }
  // Mounted without chips too: a Morph that mounts as a tick adds the first would start an empty view transition.
  return (
    <Morph name="chips">
      {chips.length > 0 && (
        <ul ref={list} aria-label="Active filters" className={cn("flex flex-wrap gap-2", className)}>
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
                onClick={(event) => {
                  handOn(event.currentTarget);
                  onChange(filter.without);
                }}
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
