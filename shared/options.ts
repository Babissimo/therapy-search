import data from "./options.json";
import { MULTI_PARAMS, type AllowedValues, type MultiParam } from "./query";
import type { Options } from "./types";

/** UKCP's filter vocabulary, extracted by `npm run options` and checked daily by the canary. */
export const OPTIONS: Options = data;

export function allowedFrom(options: Options): AllowedValues {
  const allowed = Object.fromEntries(MULTI_PARAMS.map((name) => [name, new Set<string>()])) as Record<MultiParam, Set<string>>;
  for (const field of options.groups.flatMap((g) => g.fields)) {
    if ((MULTI_PARAMS as readonly string[]).includes(field.name)) allowed[field.name as MultiParam].add(field.value);
  }
  return { ...allowed, HelpWith: new Set(options.helpWith) };
}

export const ALLOWED = allowedFrom(OPTIONS);
