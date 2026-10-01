import { useLayoutEffect, useState, useSyncExternalStore } from "react";
import { emptyParams, type SearchParams } from "@shared/query";
import { createStore } from "@/lib/store";
import { withFlag, withText } from "./state";

/** The boxes typed in before a search. */
type Box = "location" | "keyword";

export type SearchDrafts = {
  /** What is typed in `box`, which `useDraft` reads and redraws with as it changes. */
  get: (box: Box) => string;
  subscribe: (onChange: () => void) => () => void;
  set: (box: Box, text: string) => void;
  /** Searches for `next`, taking whatever is typed in the location and keyword boxes with it. */
  submit: (next: SearchParams) => void;
  /** Searches `location`, putting it in the box in place of whatever is typed there, and takes the typed keyword with it. */
  submitAt: (next: SearchParams, location: string) => void;
  /** Searches the typed location with no filters: the location places the search rather than narrowing it. */
  clear: () => void;
};

/**
 * What is typed but not yet searched, shared by the search box and the filter panel so any change submits it all. It
 * lives outside React state, so a keystroke redraws the box typed in rather than the page and every card on it. Each
 * box's draft is reset whenever the URL's value for it changes.
 */
export function useSearchDrafts(params: SearchParams, onChange: (next: SearchParams) => void): SearchDrafts {
  const [store] = useState(() => createDraftStore({ location: params.text.Location, keyword: params.text.KeywordFilter }));
  const { Location, KeywordFilter } = params.text;
  useLayoutEffect(() => store.set("location", Location), [store, Location]);
  useLayoutEffect(() => store.set("keyword", KeywordFilter), [store, KeywordFilter]);
  const typed = (next: SearchParams, location: string) => withText(withText(next, "Location", location), "KeywordFilter", store.get("keyword"));
  return {
    get: store.get,
    subscribe: store.subscribe,
    set: store.set,
    submit: (next) => onChange(typed(next, store.get("location"))),
    submitAt: (next, at) => {
      // Set here as well, as a search the page already shows leaves the draft alone.
      store.set("location", at);
      onChange(typed(next, at));
    },
    clear: () => {
      store.set("keyword", "");
      onChange(withFlag(withText(emptyParams(), "Location", store.get("location")), "LocationSearchOutsideUK", params.flags.LocationSearchOutsideUK));
    },
  };
}

/** What is typed in `box`, redrawing the caller alone as it changes. */
export function useDraft(drafts: SearchDrafts, box: Box): string {
  return useSyncExternalStore(drafts.subscribe, () => drafts.get(box));
}

function createDraftStore(initial: Record<Box, string>) {
  const typed = createStore(initial);
  return {
    get: (box: Box) => typed.get()[box],
    set: (box: Box, text: string) => {
      if (typed.get()[box] !== text) typed.set({ ...typed.get(), [box]: text });
    },
    subscribe: typed.subscribe,
  };
}
