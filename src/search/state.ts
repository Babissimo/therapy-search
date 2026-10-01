import { OPTIONS } from "@shared/options";
import { FLAG_PARAMS, MULTI_PARAMS, type FlagParam, type MultiParam, type SearchParams, type TextParam } from "@shared/query";
import type { FilterField, FilterGroup } from "@shared/types";

export function withText(params: SearchParams, name: TextParam, value: string): SearchParams {
  return { ...params, text: { ...params.text, [name]: value.trim() } };
}

export function withFlag(params: SearchParams, name: FlagParam, on: boolean): SearchParams {
  return { ...params, flags: { ...params.flags, [name]: on } };
}

export function withMulti(params: SearchParams, name: MultiParam, value: string, on: boolean): SearchParams {
  const others = params.multi[name].filter((v) => v !== value);
  return { ...params, multi: { ...params.multi, [name]: on ? [...others, value] : others } };
}

export function withPage(params: SearchParams, page: number): SearchParams {
  return { ...params, page };
}

/** Whether `params` have a place to search near. */
export function placed(params: SearchParams): boolean {
  return params.text.Location !== "";
}

/** UKCP's filter panel mixes multi-value groups and single true/false flags; the field's name says which. */
export function withField(params: SearchParams, field: FilterField, on: boolean): SearchParams {
  if (isMulti(field.name)) return withMulti(params, field.name, field.value, on);
  if (isFlag(field.name)) return withFlag(params, field.name, on);
  return params;
}

export function isChecked(params: SearchParams, field: FilterField): boolean {
  if (isMulti(field.name)) return params.multi[field.name].includes(field.value);
  if (isFlag(field.name)) return params.flags[field.name];
  return false;
}

/** Ticks narrowing the search. UKCP's groups rather than the panel's, so the outside-UK tick, which makes no chip and survives Clear all, goes uncounted. */
export function tickedFilters(params: SearchParams): number {
  return OPTIONS.groups.reduce((sum, group) => sum + tickedIn(params, group), 0);
}

export function tickedIn(params: SearchParams, group: FilterGroup): number {
  return group.fields.filter((field) => isChecked(params, field)).length;
}

/** HelpWith holds terms from UKCP's typeahead, comma-separated. */
export function helpWithTerms(params: SearchParams): string[] {
  return params.text.HelpWith.split(",")
    .map((t) => t.trim())
    .filter(Boolean);
}

export function withHelpWithTerms(params: SearchParams, terms: string[]): SearchParams {
  return withText(params, "HelpWith", terms.join(", "));
}

export function isMulti(name: string): name is MultiParam {
  return (MULTI_PARAMS as readonly string[]).includes(name);
}

function isFlag(name: string): name is FlagParam {
  return (FLAG_PARAMS as readonly string[]).includes(name);
}
