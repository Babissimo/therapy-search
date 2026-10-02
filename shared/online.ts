import { toQuery, type SearchParams } from "./query";

/** UKCP's session types that need no shared room. */
export const REMOTE_SESSIONS: readonly string[] = ["Online Therapy", "Telephone Therapy"];

/**
 * A search as the online view keeps it: no place, no wheelchair access to premises that remote sessions never use, and
 * of the session types only those that can be had remotely.
 */
export function onlineParams(params: SearchParams): SearchParams {
  const remote = params.multi.TypesOfSession.filter((type) => REMOTE_SESSIONS.includes(type));
  return {
    ...params,
    text: { ...params.text, Location: "" },
    flags: { ...params.flags, LocationSearchOutsideUK: false, OnlyWheelchairAccessible: false },
    multi: { ...params.multi, TypesOfSession: remote },
  };
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
