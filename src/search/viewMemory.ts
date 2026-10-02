import { useLayoutEffect, useRef, useState } from "react";
import type { ListTab } from "./ListTabs";

/** How far a visitor had got in a search: the list's open tab and its scroll, and the map's view with how many therapists it had placed then. */
export type SavedView = { tab?: ListTab; scrollTop?: number; map?: { fitKey: string; placed: number; centre: [number, number]; zoom: number } };

// Keyed by history entry, so a return to an entry finds what it showed. Memory only: a reload starts afresh.
const views = new Map<string, SavedView>();

export function savedView(entry: string): SavedView {
  return views.get(entry) ?? {};
}

export function saveView(entry: string, view: SavedView) {
  views.set(entry, { ...views.get(entry), ...view });
}

/** Forgets what every history entry showed, as a page load does. */
export function forgetViews() {
  views.clear();
}

/** The list's open tab, opening on the one last picked at this history entry, or else on the results. */
export function useRememberedTab(entry: string): [ListTab, (tab: ListTab) => void] {
  const [open, setOpen] = useState(() => openAt(entry));
  // A jump through history can bring the view, still mounted, to another of its entries.
  if (open.entry !== entry) setOpen(openAt(entry));
  const pick = (tab: ListTab) => {
    saveView(entry, { tab });
    setOpen({ entry, tab });
  };
  return [open.tab, pick];
}

function openAt(entry: string): { entry: string; tab: ListTab } {
  return { entry, tab: savedView(entry).tab ?? "results" };
}

/**
 * Scrolls a list back to where it was for this history entry once it has content, and records it as it moves. A list
 * that shares its element with another passes a key of its own in place of the entry. One that hides passes `ready`
 * false while it is out of sight, and is scrolled back as it shows again.
 */
export function useRememberedScroll(entry: string, ready: boolean) {
  const ref = useRef<HTMLDivElement>(null);
  const restored = useRef<{ entry: string; element: HTMLDivElement } | null>(null);
  // Once per entry and element, so a list that takes over from another for the same entry opens where it left off.
  useLayoutEffect(() => {
    const element = ref.current;
    if (!ready) restored.current = null;
    if (!ready || !element || (restored.current?.entry === entry && restored.current.element === element)) return;
    restored.current = { entry, element };
    element.scrollTop = savedView(entry).scrollTop ?? 0;
  });
  return { ref, save: (scrollTop: number) => saveView(entry, { scrollTop }) };
}
