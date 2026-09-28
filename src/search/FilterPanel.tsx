import { useId } from "react";
import { CircleHelp } from "lucide-react";
import { Link } from "react-router";
import { OPTIONS } from "@shared/options";
import { TEXT_MAX_LENGTH, type SearchParams } from "@shared/query";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { CheckboxGroup } from "./CheckboxGroup";
import { isChecked, tickedIn, withField, withFlag } from "./state";
import { TickedCount } from "./TickedCount";
import type { SearchDrafts } from "./useSearchDrafts";

/** The long lists that carry an in-list search box on UKCP. */
const SEARCHABLE = new Set(["TypesOfTherapy", "Languages", "Colleges"]);

type Props = { params: SearchParams; drafts: SearchDrafts; onSearch?: () => void };

/** Keyword and UKCP's "Refine your search" filters, under a heading its container gives. Every change takes the typed location and keyword with it. */
export function FilterPanel({ params, drafts, onSearch }: Props) {
  const outsideUkId = useId();
  const openGroups = OPTIONS.groups.filter((g) => tickedIn(params, g) > 0).map((g) => g.label);

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Button variant="link" size="sm" className="h-auto px-0" asChild>
          <Link to="/">Clear all filters</Link>
        </Button>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            drafts.submit(params);
            onSearch?.();
          }}
        >
          <Input
            type="search"
            aria-label="Keyword search"
            placeholder="Keyword search"
            maxLength={TEXT_MAX_LENGTH}
            value={drafts.keyword}
            onChange={(e) => drafts.setKeyword(e.target.value)}
          />
        </form>
      </div>

      <div className="flex items-center gap-2">
        <Checkbox
          id={outsideUkId}
          checked={params.flags.LocationSearchOutsideUK}
          onCheckedChange={(checked) => drafts.submit(withFlag(params, "LocationSearchOutsideUK", checked === true))}
        />
        <label htmlFor={outsideUkId} className="text-sm">
          Search locations outside the UK
        </label>
      </div>

      <Accordion type="multiple" defaultValue={openGroups}>
        {OPTIONS.groups.map((group) => (
          <AccordionItem key={group.label} value={group.label}>
            <div className="flex items-center gap-1">
              <AccordionTrigger className="flex-1">
                <span className="flex items-center gap-2">
                  {group.label}
                  <TickedCount count={tickedIn(params, group)} />
                </span>
              </AccordionTrigger>
              {group.help && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button type="button" variant="ghost" size="icon-sm" aria-label={`About ${group.label}`}>
                      <CircleHelp aria-hidden />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent className="max-w-xs">{group.help}</TooltipContent>
                </Tooltip>
              )}
            </div>
            {/* Headings open and searches narrow inside an open group, so its height follows the content. */}
            <AccordionContent className="h-auto">
              <CheckboxGroup
                group={group}
                searchable={group.fields.some((f) => SEARCHABLE.has(f.name))}
                isChecked={(field) => isChecked(params, field)}
                onToggle={(field, on) => drafts.submit(withField(params, field, on))}
              />
            </AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
    </div>
  );
}
