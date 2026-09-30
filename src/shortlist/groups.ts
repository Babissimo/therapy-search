import { createContext, useContext, useSyncExternalStore } from "react";
import type { Status } from "./store";

/** The shortlist's closed groups, which the tab's list and the map both leave out. */
export type ClosedGroups = {
  get: () => ReadonlySet<Status>;
  toggle: (status: Status) => void;
  subscribe: (onChange: () => void) => () => void;
};

/**
 * Kept in memory for the page load rather than stored, being how the list is viewed rather than what is on it. "Set
 * aside" starts closed, holding those the visitor has finished with.
 */
export function createClosedGroups(): ClosedGroups {
  let closed: ReadonlySet<Status> = new Set<Status>(["setAside"]);
  const listeners = new Set<() => void>();
  return {
    get: () => closed,
    toggle: (status) => {
      const next = new Set(closed);
      if (!next.delete(status)) next.add(status);
      closed = next;
      for (const listener of listeners) listener();
    },
    subscribe: (onChange) => {
      listeners.add(onChange);
      return () => void listeners.delete(onChange);
    },
  };
}

/** The groups the page's tab and map share; left unset, the ones kept for this page load. */
export const ClosedGroupsContext = createContext<ClosedGroups | null>(null);

let pageGroups: ClosedGroups | undefined;

export function useClosedGroups(): [ReadonlySet<Status>, (status: Status) => void] {
  const groups = useContext(ClosedGroupsContext) ?? (pageGroups ??= createClosedGroups());
  return [useSyncExternalStore(groups.subscribe, groups.get), groups.toggle];
}
