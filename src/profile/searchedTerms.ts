import { useMemo } from "react";
import { useLocation } from "react-router";
import { InvalidParam, readParams, type SearchParams } from "@shared/query";
import type { Profile } from "@shared/types";
import { soughtTerms } from "@/search/activeFilters";
import { backgroundOf } from "./profileLink";

function readSearch(search: string): SearchParams | undefined {
  try {
    return readParams(new URLSearchParams(search));
  } catch (error) {
    if (error instanceof InvalidParam) return undefined;
    throw error;
  }
}

/** The search a profile was opened from, if it was. */
function useOpeningSearch(): SearchParams | undefined {
  const search = backgroundOf(useLocation())?.search;
  return useMemo(() => (search === undefined ? undefined : readSearch(search)), [search]);
}

/** Whether a tag is one the visitor searched for, as the result cards judge it; nothing is, on a profile not opened from a search. */
export function useSearchMatch(): (tag: string) => boolean {
  const params = useOpeningSearch();
  return useMemo(() => {
    const sought = params ? soughtTerms(params) : new Set<string>();
    return (tag) => sought.has(tag.toLowerCase());
  }, [params]);
}

/** Every tag on the profile that matches, once each, in the order the profile lists them. */
export function matchingTags(profile: Profile, isMatch: (tag: string) => boolean): string[] {
  const tags = [...profile.about, ...profile.practical].flatMap((section) => [...section.items, ...section.details.map((detail) => detail.title)]);
  const matches = new Map<string, string>();
  for (const tag of [...tags, ...profile.languages]) if (isMatch(tag) && !matches.has(tag.toLowerCase())) matches.set(tag.toLowerCase(), tag);
  return [...matches.values()];
}
