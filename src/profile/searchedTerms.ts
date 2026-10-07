import { useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useLocation } from "react-router";
import { InvalidParam, type SearchParams } from "@shared/query";
import type { Profile, TherapistCard } from "@shared/types";
import { backgroundOf } from "@/lib/drawerRoute";
import { soughtTerms } from "@/search/activeFilters";
import { shownCard } from "@/search/useResults";
import { viewSearch } from "@/search/useSearchState";

/** The search a profile was opened from, as the view beneath it shows it, if it was opened from one. */
function useOpeningSearch(): SearchParams | undefined {
  const { pathname, search } = backgroundOf(useLocation()) ?? {};
  return useMemo(() => {
    if (pathname === undefined || search === undefined) return undefined;
    try {
      return viewSearch(pathname, search);
    } catch (error) {
      if (error instanceof InvalidParam) return undefined;
      throw error;
    }
  }, [pathname, search]);
}

/** Whether a tag is one the visitor searched for, as the result cards judge it; nothing is, on a profile not opened from a search. */
export function useSearchMatch(): (tag: string) => boolean {
  const params = useOpeningSearch();
  return useMemo(() => {
    const sought = params ? soughtTerms(params) : new Set<string>();
    return (tag) => sought.has(tag.toLowerCase());
  }, [params]);
}

/** The card the search a profile was opened from showed for the therapist, while that search's results are kept. */
export function useOpeningCard(slug: string): TherapistCard | undefined {
  const params = useOpeningSearch();
  const client = useQueryClient();
  return params && shownCard(client, params, slug);
}

/** Every tag on the profile that matches, once each, in the order the profile lists them. */
export function matchingTags(profile: Profile, isMatch: (tag: string) => boolean): string[] {
  const tags = [...profile.about, ...profile.practical].flatMap((section) => [...section.items, ...section.details.map((detail) => detail.title)]);
  const matches = new Map<string, string>();
  for (const tag of [...tags, ...profile.languages]) if (isMatch(tag) && !matches.has(tag.toLowerCase())) matches.set(tag.toLowerCase(), tag);
  return [...matches.values()];
}
