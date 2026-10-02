import { useCallback, useRef, useSyncExternalStore } from "react";

/**
 * Whether a media query matches, following it as the window changes. Printing keeps the screen's answer, as a browser
 * lays the page out afresh at the paper's width, and a page redrawn for that midway through printing comes out blank; so
 * this can't follow a query about paper itself.
 */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      // Printing's end too, which lets go of the screen's answer.
      const lists = [window.matchMedia(query), window.matchMedia("print")];
      for (const list of lists) list.addEventListener("change", onChange);
      return () => {
        for (const list of lists) list.removeEventListener("change", onChange);
      };
    },
    [query],
  );
  const onScreen = useRef<{ query: string; matches: boolean }>(undefined);
  return useSyncExternalStore(subscribe, () => {
    const matches = window.matchMedia(query).matches;
    const held = onScreen.current;
    if (held?.query === query && held.matches !== matches && window.matchMedia("print").matches) return held.matches;
    onScreen.current = { query, matches };
    return matches;
  });
}
