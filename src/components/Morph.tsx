import { addTransitionType, startTransition, ViewTransition, type ReactNode } from "react";

const MORPH = "morph";

// Only a change begun with startMorph animates; a tick, a new search or anything else lands at once.
const ON_MORPH = { [MORPH]: "auto", default: "none" };

/**
 * Carries what it wraps from its place in one layout of the page to its place in the next: the same element moved, or
 * another that a Morph of the same name wraps there. Its styles are index.css's.
 */
export function Morph({ name, children }: { name: string; children: ReactNode }) {
  return (
    <ViewTransition name={name} default={ON_MORPH}>
      {children}
    </ViewTransition>
  );
}

/**
 * Makes the navigation `navigate` starts one the page's Morphs animate, index.css telling it apart by `kind` if given.
 * React Router's own transition inherits the types.
 */
export function startMorph(navigate: () => void, kind?: string) {
  startTransition(() => {
    addTransitionType(MORPH);
    if (kind) addTransitionType(kind);
    navigate();
  });
}
