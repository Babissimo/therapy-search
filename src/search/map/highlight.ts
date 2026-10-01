import { createStore, type Store } from "@/lib/store";

/**
 * The therapist whose card the pointer or focus is on. It lives outside React state, so a hover redraws only what
 * subscribes (the pins), not the page and every card with it.
 */
export type Highlight = Store<string | undefined>;

export function createHighlight(): Highlight {
  return createStore<string | undefined>(undefined);
}
