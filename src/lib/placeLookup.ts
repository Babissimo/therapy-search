import { queryOptions, skipToken, type QueryKey } from "@tanstack/react-query";
import type { PlaceLookup, PlaceOptions } from "@shared/location";
import { api } from "./api";

// Places don't move, so answers last the session. Both kinds of lookup are typed by QueryKey rather than their keys'
// shapes, so a caller can choose between them.

/** A place looked up by one text, keyed by it and the options alone, so the search's map and a profile's office map share each answer. */
export function placeLookup(text: string | undefined, options: PlaceOptions) {
  return queryOptions<PlaceLookup, Error, PlaceLookup, QueryKey>({
    queryKey: ["place", { text, ...options }],
    queryFn: text === undefined ? skipToken : () => api.place(text, options),
    staleTime: Infinity,
    gcTime: Infinity,
  });
}

/** The answer for the first of several texts that is found, else the last one's, keyed apart from any one text's. */
export function firstFoundLookup(texts: string[], options: PlaceOptions) {
  return queryOptions<PlaceLookup, Error, PlaceLookup, QueryKey>({
    queryKey: ["place", { texts, ...options }],
    queryFn: () => firstFound(texts, options),
    staleTime: Infinity,
    gcTime: Infinity,
  });
}

async function firstFound(texts: string[], options: PlaceOptions): Promise<PlaceLookup> {
  let answer: PlaceLookup = { found: false, reason: "not-found" };
  for (const text of texts) {
    answer = await api.place(text, options);
    if (answer.found) break;
  }
  return answer;
}
