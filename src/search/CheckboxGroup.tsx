import { startTransition, useEffect, useId, useMemo, useRef, useState } from "react";
import { ChevronRight, Info } from "lucide-react";
import { sectionsOf } from "@shared/sections";
import type { FilterField, FilterGroup } from "@shared/types";
import { HelpTip } from "@/components/HelpTip";
import { Checkbox } from "@/components/ui/checkbox";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { isMulti } from "./state";
import { TickedCount } from "./TickedCount";

// A long list scrolls within its group. The padding holds the checkboxes' enlarged hit areas, which otherwise overhang the
// last row and let a list that fits scroll a little; the margin takes it back out of the layout.
const SCROLL_BOX = "-mb-1.5 max-h-64 overflow-y-auto pr-1 pb-1.5";
// A flat list first mounts a few more boxes than its scroll box shows, and the rest once still, so mounting can't eat its opening.
const FIRST_BOXES = 12;

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
  const sections = useMemo(() => sectionsOf(group), [group]);
  // Headings holding a tick start open, as the panel's groups do, and a heading opens when a box under it is ticked.
  const [open, setOpen] = useState(() => new Set(sections?.filter((s) => s.fields.some(isChecked)).map((s) => s.heading)));
  // Boxes ticked when the list opens go first; later ticks stay put, so a box never moves from under the pointer.
  const [first] = useState(() => new Set(group.fields.filter(isChecked)));
  const needle = filter.trim().toLowerCase();
  const matches = (f: FilterField) => f.label.toLowerCase().includes(needle);
  const inView = (fields: FilterField[]) => fields.filter(matches).sort((a, b) => Number(first.has(b)) - Number(first.has(a)));
  const shown = inView(group.fields);
  const listRef = useRef<HTMLUListElement>(null);
  const [whole, setWhole] = useState(sections !== undefined || group.fields.length <= FIRST_BOXES);
  useEffect(() => (whole || !listRef.current ? undefined : whenStill(listRef.current, () => startTransition(() => setWhole(true)))), [whole]);
  // UKCP ANDs a list's values, where a list of boxes reads as "any of these", except the session types, which it ORs.
  const narrows = group.fields.every((f) => isMulti(f.name) && f.name !== "TypesOfSession") && group.fields.some(isChecked);

  const openSection = (heading: string, on: boolean) =>
    setOpen((before) => {
      const after = new Set(before);
      if (on) after.add(heading);
      else after.delete(heading);
      return after;
    });
  const tick = (field: FilterField, on: boolean) => {
    const heading = sections?.find((s) => s.fields.includes(field))?.heading;
    if (on && heading !== undefined) setOpen((before) => new Set(before).add(heading));
    onToggle(field, on);
  };

  const item = (field: FilterField) => {
    const id = `${baseId}${group.fields.indexOf(field)}`;
    return (
      <li key={`${field.name}=${field.value}`} className="flex items-center gap-2">
        <Checkbox id={id} checked={isChecked(field)} onCheckedChange={(checked) => tick(field, checked === true)} />
        <label htmlFor={id} className="text-sm">
          {field.label}
        </label>
      </li>
    );
  };
  const nothing = shown.length === 0 && <li className="text-sm text-muted-foreground">Nothing matches that.</li>;

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
      {sections ? (
        <ul className={cn("space-y-1", SCROLL_BOX)}>
          {sections.map((section) => {
            const fields = inView(section.fields);
            if (fields.length === 0) return null;
            // A search shows every match, so its headings are labels rather than toggles.
            const expanded = needle !== "" || open.has(section.heading);
            return (
              <Collapsible key={section.heading} asChild open={expanded} onOpenChange={(on) => openSection(section.heading, on)}>
                <li>
                  <div className="flex items-center gap-1">
                    {needle ? (
                      <span className="py-1 text-sm text-muted-foreground">{section.heading}</span>
                    ) : (
                      <CollapsibleTrigger className="flex items-center gap-1.5 rounded-md py-1 text-left text-sm outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50">
                        <ChevronRight className={cn("size-4 shrink-0 text-muted-foreground motion-safe:transition-transform", expanded && "rotate-90")} aria-hidden />
                        <span>{section.heading}</span>
                        <TickedCount count={section.fields.filter(isChecked).length} />
                      </CollapsibleTrigger>
                    )}
                    {section.about && <HelpTip label={`About ${section.heading}`}>{section.about}</HelpTip>}
                  </div>
                  <CollapsibleContent>
                    <ul className="space-y-2 py-1 pl-5.5">{fields.map(item)}</ul>
                  </CollapsibleContent>
                </li>
              </Collapsible>
            );
          })}
          {nothing}
        </ul>
      ) : (
        <ul ref={listRef} className={cn("space-y-2", SCROLL_BOX)}>
          {(whole ? shown : shown.slice(0, FIRST_BOXES)).map(item)}
          {nothing}
        </ul>
      )}
    </div>
  );
}

/** Runs `run` once no finite animation plays on `el` or an element around it. A group closed first unmounts before then. */
function whenStill(el: Element, run: () => void): () => void {
  let live = true;
  const wait = () => {
    if (!live) return;
    const moving = (document.getAnimations?.() ?? []).filter(
      (a) => a.playState === "running" && a.effect?.getComputedTiming().endTime !== Infinity && (a.effect as KeyframeEffect | null)?.target?.contains(el),
    );
    if (moving.length === 0) run();
    else void Promise.allSettled(moving.map((a) => a.finished)).then(wait);
  };
  wait();
  return () => {
    live = false;
  };
}
