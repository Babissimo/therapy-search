import { useCallback, useState } from "react";
import { flushSync } from "react-dom";

type Entry<T> = { key: string; item: T; entering: boolean; leaving: boolean };

export type Shown<T> = {
  key: string;
  item: T;
  /** For the item's element: `data-entering` as it arrives after the first draw, and `data-leaving`, out of reach, as it goes. */
  props: {
    ref?: (element: HTMLElement | null) => (() => void) | undefined;
    inert: boolean;
    "data-entering"?: "";
    "data-leaving"?: "";
  };
};

/**
 * `items`, with each one gone from them kept in its place until its element's exit animation, which its `data-leaving`
 * starts, ends. One with no exit animation to play, as under reduced motion, goes at once. Likewise one arriving is
 * `data-entering` only until its entrance ends or is cut short, so hiding it and showing it again doesn't replay it.
 */
export function useLeaving<T>(items: readonly T[], keyOf: (item: T) => string): Shown<T>[] {
  const keys = JSON.stringify(items.map(keyOf));
  const [state, setState] = useState(() => ({
    keys,
    entries: items.map((item): Entry<T> => ({ key: keyOf(item), item, entering: false, leaving: false })),
  }));
  if (state.keys !== keys) setState({ keys, entries: merge(state.entries, items, keyOf) });
  const gone = useCallback((key: string) => setState((s) => ({ ...s, entries: s.entries.filter((e) => !(e.leaving && e.key === key)) })), []);
  const entered = useCallback(
    (key: string) => setState((s) => ({ ...s, entries: s.entries.map((e) => (e.entering && e.key === key ? { ...e, entering: false } : e)) })),
    [],
  );
  const current = new Map(items.map((item) => [keyOf(item), item]));
  return state.entries.map(({ key, item, entering, leaving }) => ({
    key,
    // Drawn as it is now while it stays, and as it was last as it goes.
    item: current.get(key) ?? item,
    props: leaving
      ? { ref: played(() => gone(key)), inert: true, "data-leaving": "" }
      : entering
        ? { ref: played(() => entered(key)), inert: false, "data-entering": "" }
        : { inert: false },
  }));
}

const PRESENT = [true] as const;
const ABSENT: readonly true[] = [];

/** One element's entry, as `useLeaving` gives it, while `present` and as it goes once not; nothing once it has gone. */
export function usePresence(present: boolean): Shown<true> | undefined {
  return useLeaving(present ? PRESENT : ABSENT, () => "present")[0];
}

/** `items` in their order, with each entry gone from them kept after whichever entry it followed. */
function merge<T>(before: Entry<T>[], items: readonly T[], keyOf: (item: T) => string): Entry<T>[] {
  const prior = new Map(before.map((entry) => [entry.key, entry]));
  const entries = items.map((item): Entry<T> => {
    const key = keyOf(item);
    const was = prior.get(key);
    // Still entering as others come and go, so its entrance isn't cut short.
    return { key, item, entering: !was || was.leaving || was.entering, leaving: false };
  });
  const has = (key: string) => entries.some((entry) => entry.key === key);
  before.forEach((entry, index) => {
    if (has(entry.key)) return;
    const previous = before.slice(0, index).findLast((e) => has(e.key));
    entries.splice(previous ? entries.findIndex((e) => e.key === previous.key) + 1 : 0, 0, { ...entry, leaving: true });
  });
  return entries;
}

/** An entering or leaving element's ref, calling `done` once its entrance or exit ends or is cut short, or at once if it has none. */
function played(done: () => void) {
  return (element: HTMLElement | null) => {
    if (!element) return undefined;
    const names = getComputedStyle(element).animationName.split(", ");
    if (names.every((name) => name === "" || name === "none")) {
      done();
      return undefined;
    }
    const end = (event: Event) => {
      // Its own, rather than an animation within it or the entrance an exit cut short. Done before the next frame, which
      // would draw one leaving as it was before its exit.
      if (event.target === element && names.includes((event as AnimationEvent).animationName)) flushSync(done);
    };
    element.addEventListener("animationend", end);
    element.addEventListener("animationcancel", end);
    return () => {
      element.removeEventListener("animationend", end);
      element.removeEventListener("animationcancel", end);
    };
  };
}
