import { TEXT_MAX_LENGTH, type SearchParams } from "@shared/query";
import type { FilterGroup } from "@shared/types";
import { HelpTip } from "@/components/HelpTip";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CheckboxGroup } from "./CheckboxGroup";
import { FILTER_GROUPS, groupName, groupNameInSentence } from "./filterGroups";
import { isChecked, tickedIn, withField } from "./state";
import { TickedCount } from "./TickedCount";
import type { SearchDrafts } from "./useSearchDrafts";

/** The long lists that carry an in-list search box on UKCP. */
const SEARCHABLE = new Set(["TypesOfTherapy", "Languages", "Colleges"]);

type Props = { params: SearchParams; drafts: SearchDrafts; groups?: FilterGroup[]; onSearch?: () => void };

/** Keyword and UKCP's "Refine your search" filters, under a heading its container gives. Every change takes the typed location and keyword with it. */
export function FilterPanel({ params, drafts, groups = FILTER_GROUPS, onSearch }: Props) {
  const openGroups = groups.filter((g) => tickedIn(params, g) > 0).map((g) => g.label);

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Button type="button" variant="link" size="sm" className="h-auto px-0" onClick={drafts.clear}>
          Clear all filters
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

      <Accordion type="multiple" defaultValue={openGroups}>
        {groups.map((group) => (
          <AccordionItem key={group.label} value={group.label}>
            <div className="flex items-center gap-1">
              <AccordionTrigger className="flex-1">
                <span className="flex items-center gap-2">
                  {groupName(group)}
                  <TickedCount count={tickedIn(params, group)} />
                </span>
              </AccordionTrigger>
              {group.help && <HelpTip label={`About ${groupNameInSentence(group)}`}>{group.help}</HelpTip>}
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
