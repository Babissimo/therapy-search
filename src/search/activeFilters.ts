import { OPTIONS } from "@shared/options";
import type { SearchParams } from "@shared/query";
import type { Options } from "@shared/types";
import { helpWithTerms, isChecked, withField, withHelpWithTerms, withText } from "./state";

/** One filter narrowing the search, with the search as it would be without it. */
export type ActiveFilter = { key: string; label: string; without: SearchParams };

/** HelpWith terms, which only a link can carry, then the panel's ticked boxes in panel order, then the keyword. Location and distance are left out: they place the search rather than narrow it. */
export function activeFilters(params: SearchParams, options: Options = OPTIONS): ActiveFilter[] {
  const terms = helpWithTerms(params);
  const ticked = options.groups.flatMap((g) => g.fields).filter((f) => isChecked(params, f));
  // A HelpWith term and a ticked box of the same name read as one filter, so they share a chip that removes both.
  const filters: ActiveFilter[] = terms.map((term) => ({
    key: `HelpWith=${term}`,
    label: term,
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
    if (!terms.includes(field.label)) filters.push({ key: `${field.name}=${field.value}`, label: field.label, without: withField(params, field, false) });
  }
  const keyword = params.text.KeywordFilter;
  if (keyword) filters.push({ key: "KeywordFilter", label: `Keyword: ${keyword}`, without: withText(params, "KeywordFilter", "") });
  return filters;
}
