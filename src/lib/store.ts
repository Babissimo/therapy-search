import { useSyncExternalStore } from "react";

/** A value kept outside React state, so a change redraws only the components that read it rather than the page. */
export type Store<T> = {
  get: () => T;
  /** Replaces the value, telling subscribers unless it is the one already held. */
  set: (value: T) => void;
  subscribe: (onChange: () => void) => () => void;
};

export function createStore<T>(initial: T): Store<T> {
  let value = initial;
  const listeners = new Set<() => void>();
  return {
    get: () => value,
    set: (next) => {
      if (Object.is(next, value)) return;
      value = next;
      for (const listener of listeners) listener();
    },
    subscribe: (onChange) => {
      listeners.add(onChange);
      return () => void listeners.delete(onChange);
    },
  };
}

/** A store's value, redrawing the caller as it changes. */
export function useStore<T>(store: Pick<Store<T>, "get" | "subscribe">): T {
  return useSyncExternalStore(store.subscribe, store.get);
}
