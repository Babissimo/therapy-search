import { FILTER_GROUPS, groupName, groupNameInSentence } from "@shared/filterGroups";
import { TEXT_MAX_LENGTH, type SearchParams } from "@shared/query";
import type { FilterGroup } from "@shared/types";
import { HelpTip } from "@/components/HelpTip";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CheckboxGroup } from "./CheckboxGroup";
import { isChecked, tickedIn } from "./state";
import { TickedCount } from "./TickedCount";
import { useDraft, useDraftFilters, type SearchDrafts } from "./useSearchDrafts";

/** The long lists that carry an in-list search box on UKCP. */
const SEARCHABLE = new Set(["TypesOfTherapy", "Languages", "Colleges"]);

type Props = { params: SearchParams; drafts: SearchDrafts; groups?: FilterGroup[]; onSearch?: () => void };

/**
 * Keyword and UKCP's "Refine your search" filters, under a heading its container gives. Ticks wait in the draft, marked
 * until searched, for whatever searches next to take with the typed location and keyword.
 */
export function FilterPanel({ params, drafts, groups = FILTER_GROUPS, onSearch }: Props) {
  const draft = useDraftFilters(drafts);
  const openGroups = groups.filter((g) => tickedIn(draft, g) > 0).map((g) => g.label);

  return (
    <div className="space-y-6">
      <div className="space-y-2 pointer-coarse:space-y-4">
        <Button type="button" variant="link" size="sm" className="h-auto px-0" onClick={drafts.clear}>
          Clear all filters
        </Button>
        <KeywordSearch drafts={drafts} onSearch={onSearch} />
      </div>

      <Accordion type="multiple" defaultValue={openGroups}>
        {groups.map((group) => (
          // Marked with UKCP's name for the group, for a shortcut to find it by.
          <AccordionItem key={group.label} value={group.label} data-filter-group={group.label}>
            <div className="flex items-center gap-1 pointer-coarse:gap-2">
              <AccordionTrigger className="flex-1">
                <span className="flex items-center gap-2">
                  {groupName(group)}
                  <TickedCount count={tickedIn(draft, group)} />
                </span>
              </AccordionTrigger>
              {group.help && <HelpTip label={`About ${groupNameInSentence(group)}`}>{group.help}</HelpTip>}
            </div>
            {/* Headings open and searches narrow inside an open group, so its height follows the content. */}
            <AccordionContent className="h-auto">
              <CheckboxGroup
                group={group}
                searchable={group.fields.some((f) => SEARCHABLE.has(f.name))}
                isChecked={(field) => isChecked(draft, field)}
                isChanged={(field) => isChecked(draft, field) !== isChecked(params, field)}
                onToggle={drafts.toggle}
              />
            </AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
    </div>
  );
}

/** The keyword box, on its own so typing in it redraws only the box. */
function KeywordSearch({ drafts, onSearch }: Omit<Props, "params" | "groups">) {
  const keyword = useDraft(drafts, "keyword");
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        drafts.apply();
        onSearch?.();
      }}
    >
      <Input
        type="search"
        aria-label="Keyword search"
        placeholder="Keyword search"
        maxLength={TEXT_MAX_LENGTH}
        value={keyword}
        onChange={(e) => drafts.set("keyword", e.target.value)}
      />
    </form>
  );
}
