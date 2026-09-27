import { X } from "lucide-react";
import type { SearchParams } from "@shared/query";
import { Button } from "@/components/ui/button";
import { activeFilters } from "./activeFilters";

type Props = { params: SearchParams; onChange: (next: SearchParams) => void };

/** Everything narrowing the search in one row, so a tick hidden in a closed group is still in view and one click away from undoing. */
export function FilterChips({ params, onChange }: Props) {
  const filters = activeFilters(params);
  if (filters.length === 0) return null;
  return (
    <ul aria-label="Active filters" className="flex flex-wrap gap-2">
      {filters.map((filter) => (
        <li key={filter.key}>
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
  );
}
