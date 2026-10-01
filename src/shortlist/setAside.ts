import { createContext, useContext, useSyncExternalStore } from "react";

/** Whether the shortlist's "Set aside" section is open, which the tab's list and the map both follow. */
export type SetAsideView = {
  get: () => boolean;
  toggle: () => void;
  subscribe: (onChange: () => void) => () => void;
};

/**
 * Kept in memory for the page load rather than stored, being how the list is viewed rather than what is on it. It
 * starts closed, holding those the visitor has finished with.
 */
export function createSetAsideView(): SetAsideView {
  let open = false;
  const listeners = new Set<() => void>();
  return {
    get: () => open,
    toggle: () => {
      open = !open;
      for (const listener of listeners) listener();
    },
    subscribe: (onChange) => {
      listeners.add(onChange);
      return () => void listeners.delete(onChange);
    },
  };
}

/** The view the page's tab and map share; left unset, the one kept for this page load. */
export const SetAsideContext = createContext<SetAsideView | null>(null);

let pageView: SetAsideView | undefined;

export function useSetAsideOpen(): [boolean, () => void] {
  const view = useContext(SetAsideContext) ?? (pageView ??= createSetAsideView());
  return [useSyncExternalStore(view.subscribe, view.get), view.toggle];
}
