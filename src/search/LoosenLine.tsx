import { cn } from "@/lib/utils";
import type { ActiveFilter } from "./activeFilters";
import { FilterChip } from "./FilterChips";

type Props = {
  /** The search's filters, as its chips show them. */
  filters: ActiveFilter[];
  /** Where the list is, as `resultsWhere` names it. */
  where: string;
  /** How many the whole list holds. */
  found: number;
  /** Searches without the filter of this key, as its chip's × does. */
  onLoosen: (key: string, button: HTMLElement) => void;
};

/** After a whole list, how to see more: a button for each of its filters, which searches without it. */
export function LoosenLine({ filters, where, found, onLoosen }: Props) {
  if (filters.length === 0) return null;
  return (
    // Paper names the filters under the heading instead.
    <div className={cn("space-y-3 fade-in-0 wide:motion-safe:animate-in print:hidden", found > 0 && "border-t pt-4")}>
      <p>{found === 0 ? "To see more, remove a filter:" : `That's everyone${where} with these filters. To see more, remove a filter:`}</p>
      <ul className="flex flex-wrap gap-2 pointer-coarse:gap-y-3">
        {filters.map((filter) => (
          <li key={filter.key}>
            <FilterChip label={filter.label} aria-label={`Search without ${filter.label}`} onClick={(event) => onLoosen(filter.key, event.currentTarget)} />
          </li>
        ))}
      </ul>
    </div>
  );
}
