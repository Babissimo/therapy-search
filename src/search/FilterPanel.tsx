import { useId, useState } from "react";
import { CircleHelp } from "lucide-react";
import { Link } from "react-router";
import { OPTIONS } from "@shared/options";
import { DISTANCE, TEXT_MAX_LENGTH, type SearchParams } from "@shared/query";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { CheckboxGroup } from "./CheckboxGroup";
import { isChecked, tickedIn, withDistance, withField, withFlag, withText } from "./state";
import { TickedCount } from "./TickedCount";

/** The long lists that carry an in-list search box on UKCP. */
const SEARCHABLE = new Set(["TypesOfTherapy", "Languages", "Colleges"]);

type Props = { params: SearchParams; onChange: (next: SearchParams) => void; onSearch?: () => void };

/** Location, keyword and UKCP's "Refine your search" filters. */
export function FilterPanel({ params, onChange, onSearch }: Props) {
  const outsideUkId = useId();
  const [location, setLocation] = useDraft(params.text.Location);
  const [keyword, setKeyword] = useDraft(params.text.KeywordFilter);
  const [distance, setDistance] = useDraft(params.distance);
  // Every change here takes the typed location and keyword with it, so the results match what the panel shows.
  const search = (next: SearchParams) => onChange(withText(withText(next, "Location", location), "KeywordFilter", keyword));
  const openGroups = OPTIONS.groups.filter((g) => tickedIn(params, g) > 0).map((g) => g.label);

  return (
    <div className="space-y-6">
      <div className="flex items-baseline justify-between">
        <h2 className="font-semibold">Refine your search</h2>
        <Button variant="link" size="sm" className="px-0" asChild>
          <Link to="/">Clear all filters</Link>
        </Button>
      </div>

      <form
        role="search"
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          search(withDistance(params, distance));
          onSearch?.();
        }}
      >
        <div className="flex gap-2">
          <Input aria-label="Location" placeholder="Town or postcode" maxLength={TEXT_MAX_LENGTH} value={location} onChange={(e) => setLocation(e.target.value)} />
          <Button type="submit">Search</Button>
        </div>
        <Input type="search" aria-label="Keyword search" placeholder="Keyword search" maxLength={TEXT_MAX_LENGTH} value={keyword} onChange={(e) => setKeyword(e.target.value)} />
      </form>

      <div className="space-y-4 rounded-lg bg-muted p-4">
        <div className="flex justify-between text-sm">
          <span className="font-medium">Distance</span>
          <span>
            within {distance} {distance === 1 ? "mile" : "miles"}
          </span>
        </div>
        <Slider
          aria-label="Distance"
          min={DISTANCE.min}
          max={DISTANCE.max}
          step={1}
          value={[distance]}
          onValueChange={([d]) => d !== undefined && setDistance(d)}
          onValueCommit={([d]) => d !== undefined && search(withDistance(params, d))}
        />
        <div className="flex items-center gap-2">
          <Checkbox
            id={outsideUkId}
            checked={params.flags.LocationSearchOutsideUK}
            onCheckedChange={(checked) => search(withFlag(params, "LocationSearchOutsideUK", checked === true))}
          />
          <label htmlFor={outsideUkId} className="text-sm">
            Search locations outside the UK
          </label>
        </div>
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
                onToggle={(field, on) => search(withField(params, field, on))}
              />
            </AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
    </div>
  );
}

/** A local draft of a value from the URL, reset whenever the URL's value changes. */
function useDraft<T>(value: T): [T, (draft: T) => void] {
  const [draft, setDraft] = useState(value);
  const [seen, setSeen] = useState(value);
  if (value !== seen) {
    setSeen(value);
    setDraft(value);
  }
  return [draft, setDraft];
}
