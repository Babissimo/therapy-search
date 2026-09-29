export const UKCP_ORIGIN = "https://www.psychotherapy.org.uk";

export const TEXT_PARAMS = ["HelpWith", "Location", "KeywordFilter"] as const;
export const MULTI_PARAMS = ["TypesOfSession", "HelpWithAdvanced", "WorksWith", "TypesOfTherapy", "Languages", "Colleges"] as const;
export const FLAG_PARAMS = ["LocationSearchOutsideUK", "OnlyProfilesWithPhotos", "OnlyWheelchairAccessible"] as const;

export type TextParam = (typeof TEXT_PARAMS)[number];
export type MultiParam = (typeof MULTI_PARAMS)[number];
export type FlagParam = (typeof FLAG_PARAMS)[number];

/** How far every location search reaches, in miles: the furthest UKCP's form offers. Results come nearest first, so the extra reach only lengthens the list. */
export const SEARCH_MILES = 30;
/** Results shown at a time, by "Load more". */
export const PAGE_SIZE = 12;
/** Results asked of UKCP at once, since pages asked for a minute apart come from different shuffles. */
export const BATCH_SIZE = 40 * PAGE_SIZE;
export const TEXT_MAX_LENGTH = 200;
/** Our pages draw shuffle seeds from this many values, so shuffled searches share cache entries. */
export const ORDER_SEED_POOL = 64;

export type SearchParams = {
  text: Record<TextParam, string>;
  multi: Record<MultiParam, string[]>;
  flags: Record<FlagParam, boolean>;
  page: number;
  orderSeed?: number;
};

/** Allowed values for each multi-value parameter and the help-with terms, as offered by UKCP's form. */
export type AllowedValues = Record<MultiParam | "HelpWith", ReadonlySet<string>>;

export class InvalidParam extends Error {
  override name = "InvalidParam";
  constructor(readonly param: string, message: string) {
    super(message);
  }
}

export function emptyParams(): SearchParams {
  return {
    text: { HelpWith: "", Location: "", KeywordFilter: "" },
    multi: { TypesOfSession: [], HelpWithAdvanced: [], WorksWith: [], TypesOfTherapy: [], Languages: [], Colleges: [] },
    flags: { LocationSearchOutsideUK: false, OnlyProfilesWithPhotos: false, OnlyWheelchairAccessible: false },
    page: 1,
  };
}

/** Reads search parameters from a query string, throwing InvalidParam for anything UKCP's form could not send. Unknown keys are ignored. */
export function readParams(query: URLSearchParams, allowed?: AllowedValues): SearchParams {
  const params = emptyParams();
  for (const name of TEXT_PARAMS) {
    const value = (query.get(name) ?? "").trim();
    // HelpWith is checked term by term instead; a few of UKCP's longer terms together pass this length.
    if (name !== "HelpWith" && value.length > TEXT_MAX_LENGTH) throw new InvalidParam(name, `${name} is longer than ${TEXT_MAX_LENGTH} characters`);
    params.text[name] = value;
  }
  params.text.HelpWith = readHelpWith(params.text.HelpWith, allowed?.HelpWith);
  for (const name of MULTI_PARAMS) {
    const values = [...new Set(query.getAll(name))];
    const unknown = allowed ? values.find((v) => !allowed[name].has(v)) : undefined;
    if (unknown !== undefined) throw new InvalidParam(name, `${name} has no option "${unknown}"`);
    params.multi[name] = values;
  }
  for (const name of FLAG_PARAMS) {
    const value = query.get(name);
    if (value !== null && value !== "true" && value !== "false") throw new InvalidParam(name, `${name} must be true or false`);
    params.flags[name] = value === "true";
  }
  params.page = readInt(query, "page", 1, 1, 100_000);
  if (query.has("OrderSeed")) params.orderSeed = readInt(query, "OrderSeed", 1, 1, ORDER_SEED_POOL);
  return params;
}

/** HelpWith carries the typeahead's terms comma-separated; each must be one of UKCP's, and their order is fixed so equal searches match. */
function readHelpWith(value: string, allowed?: ReadonlySet<string>): string {
  const terms = [...new Set(value.split(",").map((t) => t.trim()).filter(Boolean))].sort();
  const unknown = allowed ? terms.find((t) => !allowed.has(t)) : undefined;
  if (unknown !== undefined) throw new InvalidParam("HelpWith", `HelpWith has no option "${unknown}"`);
  return terms.join(", ");
}

function readInt(query: URLSearchParams, name: string, fallback: number, min: number, max: number): number {
  const raw = query.get(name);
  if (raw === null || raw === "") return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < min || value > max) throw new InvalidParam(name, `${name} must be a whole number from ${min} to ${max}`);
  return value;
}

/**
 * The one query string for a search: fixed key order, sorted values, defaults left out.
 * The seed is only included when asked for and when there is no location, since location searches are ordered by distance.
 */
export function toQuery(params: SearchParams, { withSeed = false } = {}): string {
  const q = new URLSearchParams();
  if (params.text.HelpWith) q.append("HelpWith", params.text.HelpWith);
  if (params.text.Location) q.append("Location", params.text.Location);
  if (params.text.KeywordFilter) q.append("KeywordFilter", params.text.KeywordFilter);
  for (const name of MULTI_PARAMS) for (const value of [...params.multi[name]].sort()) q.append(name, value);
  for (const name of FLAG_PARAMS) if (params.flags[name]) q.append(name, "true");
  if (params.page > 1) q.append("page", String(params.page));
  if (withSeed && !params.text.Location && params.orderSeed !== undefined) q.append("OrderSeed", String(params.orderSeed));
  return q.toString();
}

/** The same search on UKCP's own site, which reads these parameters from its query string. */
export function ukcpSearchUrl(params: SearchParams): string {
  const q = new URLSearchParams(toQuery(params));
  // UKCP's own page reaches 10 miles unless told otherwise.
  if (params.text.Location) q.set("Distance", String(SEARCH_MILES));
  const query = q.toString();
  return `${UKCP_ORIGIN}/find-a-therapist/${query ? `?${query}` : ""}`;
}

export function ukcpProfileUrl(slug: string): string {
  return `${UKCP_ORIGIN}/therapist/${slug}`;
}
