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

/** Under this many found, several topics are worth narrowing to the few that matter most. */
const FEW = 5;

/** After a whole list, how to see more: a button for each of its filters, which searches without it. */
export function LoosenLine({ filters, where, found, onLoosen }: Props) {
  if (filters.length === 0) return null;
  const topics = filters.filter((filter) => filter.topic);
  // UKCP finds only those who help with every topic asked for, so the topics come first when they are what keeps the list short.
  const few = topics.length >= 2 && found < FEW;
  const shown = few ? [...topics, ...filters.filter((filter) => !filter.topic)] : filters;
  return (
    // Paper names the filters under the heading instead.
    <div className={cn("space-y-3 fade-in-0 wide:motion-safe:animate-in print:hidden", found > 0 && "border-t pt-4")}>
      {few && <p>Few therapists help with all of these. Try focusing on the one or two that matter most.</p>}
      <p>{found === 0 ? "To see more, remove a filter:" : `That's everyone${where} with these filters. To see more, remove a filter:`}</p>
      <ul className="flex flex-wrap gap-2 pointer-coarse:gap-y-3">
        {shown.map((filter) => (
          <li key={filter.key}>
            <FilterChip label={filter.label} aria-label={`Search without ${filter.label}`} onClick={(event) => onLoosen(filter.key, event.currentTarget)} />
          </li>
        ))}
      </ul>
    </div>
  );
}
