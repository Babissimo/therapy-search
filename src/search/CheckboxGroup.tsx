import { useId, useState } from "react";
import { Info } from "lucide-react";
import type { FilterField, FilterGroup } from "@shared/types";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { isMulti } from "./state";

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
  // UKCP ANDs a list's values, where a list of boxes reads as "any of these".
  const narrows = group.fields.every((f) => isMulti(f.name)) && group.fields.some(isChecked);

  return (
    <div className="space-y-3">
      {searchable && (
        <Input type="search" aria-label={`Search ${group.label}`} placeholder="Search this list" value={filter} onChange={(e) => setFilter(e.target.value)} />
      )}
      {narrows && (
        <p className="flex gap-1.5 text-xs text-muted-foreground">
          <Info className="mt-px size-3.5 shrink-0" aria-hidden />
          Therapists must match every box ticked here, so each extra tick narrows the results.
        </p>
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
