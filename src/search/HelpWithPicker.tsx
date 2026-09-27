import { useState } from "react";
import { Check, ChevronsUpDown, Info } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { helpWithGroups } from "./helpWithGroups";

const GROUPS = helpWithGroups();

type Props = { id: string; terms: string[]; onChange: (terms: string[]) => void };

/** UKCP's "I want help with" typeahead: issues and therapy types, chosen from its own list. */
export function HelpWithPicker({ id, terms, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const toggle = (term: string) => onChange(terms.includes(term) ? terms.filter((t) => t !== term) : [...terms, term]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button id={id} type="button" variant="outline" role="combobox" aria-expanded={open} className="h-auto min-h-9 w-full justify-between font-normal">
          <span className="flex flex-wrap gap-1">
            {terms.length > 0 ? (
              terms.map((t) => (
                <Badge key={t} variant="secondary">
                  {t}
                </Badge>
              ))
            ) : (
              <span className="text-muted-foreground">Issue / Therapy type</span>
            )}
          </span>
          <ChevronsUpDown className="size-4 opacity-50" aria-hidden />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-(--radix-popover-trigger-width) p-0" align="start">
        <Command>
          <CommandInput placeholder="Type to search" />
          <CommandList>
            <CommandEmpty>Nothing matches that.</CommandEmpty>
            {GROUPS.map((group) => (
              <CommandGroup key={group.heading} heading={group.heading}>
                {group.terms.map((term) => (
                  <CommandItem key={term} value={term} onSelect={() => toggle(term)}>
                    <Check className={cn("size-4", terms.includes(term) ? "opacity-100" : "opacity-0")} aria-hidden />
                    {term}
                  </CommandItem>
                ))}
              </CommandGroup>
            ))}
          </CommandList>
        </Command>
        {terms.length > 0 && (
          <p className="flex gap-1.5 border-t p-2 text-xs text-muted-foreground">
            <Info className="mt-px size-3.5 shrink-0" aria-hidden />
            Therapists must match every term chosen, so each extra one narrows the results.
          </p>
        )}
      </PopoverContent>
    </Popover>
  );
}
