/**
 * The therapist whose card the pointer or focus is on. It lives outside React state, so a hover redraws only what
 * subscribes (the pins), not the page and every card with it.
 */
export type Highlight = {
  get: () => string | undefined;
  set: (slug: string | undefined) => void;
  subscribe: (onChange: () => void) => () => void;
};

export function createHighlight(): Highlight {
  let current: string | undefined;
  const listeners = new Set<() => void>();
  return {
    get: () => current,
    set: (slug) => {
      if (slug === current) return;
      current = slug;
      for (const listener of listeners) listener();
    },
    subscribe: (onChange) => {
      listeners.add(onChange);
      return () => listeners.delete(onChange);
    },
  };
}
