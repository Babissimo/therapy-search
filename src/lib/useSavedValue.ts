import { useEffect, useEffectEvent, useState } from "react";

/** How long typing rests before what was typed is saved. */
export const SAVE_AFTER = 500;

// By contents, so a copy of what is held, as the store gives back after a save, is no change.
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/**
 * A value edited here and saved through `save` once typing rests, as the page hides or closes, and as the editor goes, since
 * neither a removed field nor a hidden page is blurred in every browser. A newly saved value, as from another tab, replaces
 * what is held. What `save` is given must come back as the new `saved`, or every one of those saves it again. `saveNow` sets
 * and saves at once.
 */
export function useSavedValue<T>(saved: T, save: (value: T) => void) {
  const [value, set] = useState(saved);
  // The saved value as last drawn; a change to it replaces what is held.
  const [seen, setSeen] = useState(saved);
  if (!same(saved, seen)) {
    setSeen(saved);
    set(saved);
  }
  // For the timer and the leaving, which want the value as last drawn.
  const flush = useEffectEvent(() => {
    if (!same(value, saved)) save(value);
  });
  useEffect(() => {
    const timer = setTimeout(() => flush(), SAVE_AFTER);
    return () => clearTimeout(timer);
  }, [value]);
  // A hidden page's timer may never run, so what was typed since the last save is saved as the page hides or the editor goes.
  useEffect(() => {
    const leave = () => flush();
    document.addEventListener("visibilitychange", leave);
    window.addEventListener("pagehide", leave);
    return () => {
      document.removeEventListener("visibilitychange", leave);
      window.removeEventListener("pagehide", leave);
      flush();
    };
  }, []);
  const saveNow = (next: T) => {
    set(next);
    save(next);
  };
  return { value, set, saveNow };
}
