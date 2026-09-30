import { emptyParams, toQuery, type SearchParams } from "@shared/query";
import { withFlag, withText } from "./state";

/** Where the search for therapists working online or by phone lives, apart from the map of those near a place. */
export const ONLINE_PATH = "/online";

/** UKCP's session types that need no shared room. */
export const REMOTE_SESSIONS: readonly string[] = ["Online Therapy", "Telephone Therapy"];

/**
 * A search as the online view keeps it: no place, no wheelchair access to premises that remote sessions never use, and
 * of the session types only those that can be had remotely.
 */
export function onlineParams(params: SearchParams): SearchParams {
  const placeless = withFlag(withFlag(withText(params, "Location", ""), "LocationSearchOutsideUK", false), "OnlyWheelchairAccessible", false);
  const remote = params.multi.TypesOfSession.filter((type) => REMOTE_SESSIONS.includes(type));
  return { ...placeless, multi: { ...placeless.multi, TypesOfSession: remote } };
}

/** What the online view asks UKCP for. UKCP lists anyone offering any ticked type, so both together are either. */
export function onlineSearch(params: SearchParams): SearchParams {
  const online = onlineParams(params);
  if (online.multi.TypesOfSession.length > 0) return online;
  return { ...online, multi: { ...online.multi, TypesOfSession: [...REMOTE_SESSIONS] } };
}

/**
 * Whether the online view has something to search for: a filter besides the session types, since online or phone
 * alone leaves thousands in a random order, which answers no one's question.
 */
export function narrowsOnline(params: SearchParams): boolean {
  const online = onlineParams(params);
  return toQuery({ ...online, multi: { ...online.multi, TypesOfSession: [] } }) !== "";
}

// The place of the search near one last on show, so Near me takes a visitor back to it from online. Memory only.
let place = emptyParams();

/** Keeps the place `params` searches near, as a search near one shows. */
export function rememberPlace(params: SearchParams) {
  place = params;
}

/** The online view's search near the place last left for it, filters and all, with that search's wheelchair tick. */
export function nearMeParams(params: SearchParams): SearchParams {
  const near = withFlag(withText(params, "Location", place.text.Location), "LocationSearchOutsideUK", place.flags.LocationSearchOutsideUK);
  return withFlag(near, "OnlyWheelchairAccessible", place.flags.OnlyWheelchairAccessible);
}
