import { OPTIONS } from "@shared/options";
import type { SearchParams } from "@shared/query";
import type { FilterField, Options } from "@shared/types";
import { helpWithTerms, isChecked, withField, withHelpWithTerms, withText } from "./state";

/** One filter narrowing the search, with the search as it would be without it, and whether it is a help-with topic. */
export type ActiveFilter = { key: string; label: string; without: SearchParams; topic: boolean };

/** HelpWith terms, which only a link can carry, then the panel's ticked boxes in panel order, then the keyword. The location is left out: it places the search rather than narrowing it. */
export function activeFilters(params: SearchParams, options: Options = OPTIONS): ActiveFilter[] {
  const terms = helpWithTerms(params);
  const ticked = tickedFields(params, options);
  // A HelpWith term and a ticked box of the same name read as one filter, so they share a chip that removes both.
  const filters: ActiveFilter[] = terms.map((term) => ({
    key: `HelpWith=${term}`,
    label: term,
    topic: true,
    without: ticked
      .filter((f) => f.label === term)
      .reduce(
        (without, f) => withField(without, f, false),
        withHelpWithTerms(
          params,
          terms.filter((t) => t !== term),
        ),
      ),
  }));
  for (const field of ticked) {
    if (terms.includes(field.label)) continue;
    filters.push({
      key: `${field.name}=${field.value}`,
      label: field.label,
      topic: field.name === "HelpWithAdvanced",
      without: withField(params, field, false),
    });
  }
  const keyword = params.text.KeywordFilter;
  if (keyword) {
    filters.push({ key: "KeywordFilter", label: `Keyword: ${keyword}`, topic: false, without: withText(params, "KeywordFilter", "") });
  }
  return filters;
}

/** What the search asks for by name, lower-cased: its HelpWith terms, ticked boxes and keyword. */
export function soughtTerms(params: SearchParams, options: Options = OPTIONS): Set<string> {
  const terms = [...helpWithTerms(params), ...tickedFields(params, options).map((f) => f.label), params.text.KeywordFilter];
  return new Set(terms.filter(Boolean).map((t) => t.toLowerCase()));
}

function tickedFields(params: SearchParams, options: Options): FilterField[] {
  return options.groups.flatMap((g) => g.fields).filter((f) => isChecked(params, f));
}
