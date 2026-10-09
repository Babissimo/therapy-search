import { useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { emptyParams, toQuery, type SearchParams } from "@shared/query";
import type { FilterField } from "@shared/types";
import { createStore } from "@/lib/store";
import { activeFilters } from "./activeFilters";
import { withField, withFlag, withText } from "./state";
import { savedView, saveView } from "./viewMemory";

/** The boxes typed in before a search. */
type Box = "location" | "keyword";

/** What is typed in each box, and the ticks, flags and help-with terms chosen with them. */
type Draft = { location: string; keyword: string; filters: SearchParams };

export type SearchDrafts = {
  /** What is typed in `box`, which `useDraft` reads and redraws with as it changes. */
  get: (box: Box) => string;
  subscribe: (onChange: () => void) => () => void;
  set: (box: Box, text: string) => void;
  /** The draft's ticks, flags and help-with terms, which `useDraftFilters` reads; its boxes are left empty. */
  filters: () => SearchParams;
  /** The draft as a search: what is typed in both boxes and every filter chosen. */
  search: () => SearchParams;
  /** Whether searching the draft would change the search on show other than by its place. */
  pending: () => boolean;
  /** Ticks or unticks a filter in the draft, searching nothing. */
  toggle: (field: FilterField, on: boolean) => void;
  /** Clears the draft's filters and keyword, searching nothing: the place and the outside-UK tick place the search rather than narrowing it. */
  clear: () => void;
  /** Searches the draft. */
  apply: () => void;
  /** Searches the draft at `location`, putting it in the box in place of whatever is typed there. */
  applyAt: (location: string) => void;
  /** Searches the draft less the filter of the chip keyed `key`, or the draft as it is if it has already dropped it. */
  applyWithout: (key: string) => void;
};

/**
 * The history entry a view's draft is for: whether the draft is kept there for a return, and any place the entry was sent
 * with, typed in the box where the search on show has none and the entry kept no draft.
 */
export type DraftEntry = { entry: string; kept: boolean; place?: string };

/**
 * What is chosen but not yet searched, shared by the search box, the filter panel and the controls that search it, so
 * every search takes it all. The search on show stays in the URL; the draft takes its filters whenever it changes, and
 * each box's draft is reset whenever the URL's value for it changes. Where the view keeps it for its history entry, a
 * view that mounts there again, or is brought back there, finds it as it was left. It lives outside React state, so a
 * keystroke or a tick redraws what reads the draft rather than the page and every card on it.
 */
export function useSearchDrafts(params: SearchParams, at: DraftEntry, onChange: (next: SearchParams) => void): SearchDrafts {
  const { entry, kept } = at;
  // Keyed by the whole search, not the object, which the page builds afresh on each render.
  const shown = toQuery(params);
  const location = params.text.Location || (at.place ?? "");
  const keyword = params.text.KeywordFilter;
  const [store] = useState(() => createDraftStore(keptAt(entry, shown) ?? { location, keyword, filters: filtersOf(params) }));
  // What the draft last took from its entry and the search on show, so it takes only what changes.
  const seen = useRef({ entry, kept, shown, location, keyword });
  useLayoutEffect(() => {
    const last = seen.current;
    seen.current = { entry, kept, shown, location, keyword };
    // A jump through history can bring the view, still mounted, to another of its entries.
    const draft = entry === last.entry ? undefined : keptAt(entry, shown);
    if (draft) {
      store.replace(draft);
      return;
    }
    if (location !== last.location) store.set("location", location);
    if (keyword !== last.keyword) store.set("keyword", keyword);
    if (shown !== last.shown) store.setFilters(filtersOf(params));
  }, [store, entry, kept, shown, location, keyword]);
  // For the entry the effect above has moved on to, so a jump never keeps one entry's draft for another.
  useLayoutEffect(() => store.subscribe(() => keep(seen.current, store.state())), [store]);
  return {
    get: (box) => store.state()[box],
    subscribe: store.subscribe,
    set: store.set,
    filters: () => store.state().filters,
    search: () => searchOf(store.state()),
    pending: () => differs(searchOf(store.state()), params),
    toggle: (field, on) => store.setFilters(withField(store.state().filters, field, on)),
    clear: () => {
      store.set("keyword", "");
      store.setFilters(withFlag(emptyParams(), "LocationSearchOutsideUK", store.state().filters.flags.LocationSearchOutsideUK));
    },
    apply: () => onChange(searchOf(store.state())),
    applyAt: (location) => {
      // Set here as well, as a search the page already shows leaves the draft alone.
      store.set("location", location);
      onChange(searchOf(store.state()));
    },
    applyWithout: (key) => {
      const draft = searchOf(store.state());
      onChange(activeFilters(draft).find((filter) => filter.key === key)?.without ?? draft);
    },
  };
}

/** What is typed in `box`, redrawing the caller alone as it changes. */
export function useDraft(drafts: SearchDrafts, box: Box): string {
  return useSyncExternalStore(drafts.subscribe, () => drafts.get(box));
}

/** The draft's ticks, flags and help-with terms, redrawing the caller as they change but not as the boxes are typed in. */
export function useDraftFilters(drafts: SearchDrafts): SearchParams {
  return useSyncExternalStore(drafts.subscribe, drafts.filters);
}

/** The draft as a search, redrawing the caller as anything in it changes, typing included. */
export function useDraftSearch(drafts: SearchDrafts): SearchParams {
  const filters = useDraftFilters(drafts);
  const location = useDraft(drafts, "location");
  const keyword = useDraft(drafts, "keyword");
  return useMemo(() => searchOf({ location, keyword, filters }), [location, keyword, filters]);
}

/** Whether the draft narrows the search, by a tick, a help-with term or the keyword, redrawing the caller only as that changes. */
export function useDraftFiltered(drafts: SearchDrafts): boolean {
  return useSyncExternalStore(drafts.subscribe, () => activeFilters(drafts.search()).length > 0);
}

/** A search's filters alone, with no place or keyword. */
function filtersOf(params: SearchParams): SearchParams {
  return withText(withText(params, "Location", ""), "KeywordFilter", "");
}

function searchOf({ location, keyword, filters }: Draft): SearchParams {
  return withText(withText(filters, "Location", location), "KeywordFilter", keyword);
}

/** The draft kept at `entry`, if it was drafted over the search on show there: an address pasted in can bring another to its key. */
function keptAt(entry: string, shown: string): Draft | undefined {
  const { draft } = savedView(entry);
  if (draft?.over !== shown) return undefined;
  const { location, keyword, filters } = draft;
  return { location, keyword, filters };
}

function keep({ entry, kept, shown }: { entry: string; kept: boolean; shown: string }, draft: Draft) {
  if (kept) saveView(entry, { draft: { over: shown, ...draft } });
}

function differs(draft: SearchParams, shown: SearchParams): boolean {
  return toQuery(withText(draft, "Location", "")) !== toQuery(withText(shown, "Location", ""));
}

function createDraftStore(initial: Draft) {
  const draft = createStore(initial);
  return {
    state: draft.get,
    set: (box: Box, text: string) => {
      if (draft.get()[box] !== text) draft.set({ ...draft.get(), [box]: text });
    },
    setFilters: (filters: SearchParams) => {
      if (toQuery(filters) !== toQuery(draft.get().filters)) draft.set({ ...draft.get(), filters });
    },
    replace: draft.set,
    subscribe: draft.subscribe,
  };
}
