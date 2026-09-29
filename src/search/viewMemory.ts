import { useLayoutEffect, useRef } from "react";

/** How far a visitor had got in a search: the list's scroll, and the map's view with how many pins it had then. */
export type SavedView = { scrollTop?: number; map?: { fitKey: string; pins: number; centre: [number, number]; zoom: number } };

// Keyed by history entry, so Back from a profile finds what that entry showed. Memory only: a reload starts afresh.
const views = new Map<string, SavedView>();

export function savedView(entry: string): SavedView {
  return views.get(entry) ?? {};
}

export function saveView(entry: string, view: SavedView) {
  views.set(entry, { ...views.get(entry), ...view });
}

/** Scrolls a list back to where it was for this history entry once it has content, and records it as it moves. */
export function useRememberedScroll(entry: string, ready: boolean) {
  const ref = useRef<HTMLDivElement>(null);
  const restored = useRef<{ entry: string; element: HTMLDivElement } | null>(null);
  // Once per entry and element, so a list that takes over from another for the same entry opens where it left off.
  useLayoutEffect(() => {
    const element = ref.current;
    if (!ready || !element || (restored.current?.entry === entry && restored.current.element === element)) return;
    restored.current = { entry, element };
    element.scrollTop = savedView(entry).scrollTop ?? 0;
  });
  return { ref, save: (scrollTop: number) => saveView(entry, { scrollTop }) };
}
