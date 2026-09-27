import { useId, useState } from "react";
import type { FilterField, FilterGroup } from "@shared/types";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";

type Props = {
  group: FilterGroup;
  searchable: boolean;
  isChecked: (field: FilterField) => boolean;
  onToggle: (field: FilterField, on: boolean) => void;
};

export function CheckboxGroup({ group, searchable, isChecked, onToggle }: Props) {
  // The panel can be mounted twice (sidebar and mobile sheet), so element ids must be per instance.
  const baseId = useId();
  const [filter, setFilter] = useState("");
  const needle = filter.trim().toLowerCase();
  const shown = needle ? group.fields.filter((f) => f.label.toLowerCase().includes(needle)) : group.fields;

  return (
    <div className="space-y-3">
      {searchable && (
        <Input type="search" aria-label={`Search ${group.label}`} placeholder="Search this list" value={filter} onChange={(e) => setFilter(e.target.value)} />
      )}
      <ul className="max-h-64 space-y-2 overflow-y-auto pr-1">
        {shown.map((field) => {
          const id = `${baseId}${group.fields.indexOf(field)}`;
          return (
            <li key={`${field.name}=${field.value}`} className="flex items-center gap-2">
              <Checkbox id={id} checked={isChecked(field)} onCheckedChange={(checked) => onToggle(field, checked === true)} />
              <label htmlFor={id} className="text-sm">
                {field.label}
              </label>
            </li>
          );
        })}
        {shown.length === 0 && <li className="text-sm text-muted-foreground">Nothing matches that.</li>}
      </ul>
    </div>
  );
}
