import { OPTIONS } from "@shared/options";
import type { Options } from "@shared/types";

export type TermGroup = { heading: string; terms: string[] };

/** UKCP's typeahead mixes issues and therapy types in one list; each term is also a box in one of those two panel groups. */
export function helpWithGroups(options: Options = OPTIONS): TermGroup[] {
  const labelsOf = (name: string) => new Set(options.groups.flatMap((g) => g.fields).filter((f) => f.name === name).map((f) => f.label));
  const issues = labelsOf("HelpWithAdvanced");
  const types = labelsOf("TypesOfTherapy");
  const groups = [
    { heading: "Issues", terms: options.helpWith.filter((t) => issues.has(t)) },
    { heading: "Types of therapy", terms: options.helpWith.filter((t) => types.has(t)) },
    { heading: "Other", terms: options.helpWith.filter((t) => !issues.has(t) && !types.has(t)) },
  ];
  return groups.filter((g) => g.terms.length > 0);
}
