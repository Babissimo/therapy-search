import { createContext, useContext, useEffect, useMemo, useSyncExternalStore } from "react";
import type { TherapistCard } from "@shared/types";
import { browserStorage } from "@/lib/storage";
import { createShortlistStore, type Shortlist, type ShortlistEntry, type ShortlistStore } from "./store";

/** The store the page's components share; left unset, it is the one kept in this browser. */
export const ShortlistContext = createContext<ShortlistStore | null>(null);

let browserStore: ShortlistStore | undefined;

export function useShortlistStore(): ShortlistStore {
  return useContext(ShortlistContext) ?? (browserStore ??= createShortlistStore(browserStorage(), Date.now, window));
}

export function useShortlist(): Shortlist {
  const store = useShortlistStore();
  return useSyncExternalStore(store.subscribe, store.get);
}

const NOBODY: Shortlist = [];

/** The shortlist while `wanted`, and nobody otherwise, so a page that shows it only at times redraws for it only then. */
export function useShortlistIf(wanted: boolean): Shortlist {
  const store = useShortlistStore();
  return useSyncExternalStore(store.subscribe, () => (wanted ? store.get() : NOBODY));
}

const NO_SLUGS: ReadonlySet<string> = new Set();

/** Who is on the shortlist while `wanted`, as a set that changes only as someone joins or leaves, not as it is reordered. */
export function useShortlistedSlugs(wanted: boolean): ReadonlySet<string> {
  const members = useShortlistIf(wanted).map((entry) => entry.card.slug).sort().join(" ");
  return useMemo(() => (members ? new Set(members.split(" ")) : NO_SLUGS), [members]);
}

export function useShortlistEntry(slug: string): ShortlistEntry | undefined {
  const store = useShortlistStore();
  return useSyncExternalStore(store.subscribe, () => store.get().find((entry) => entry.card.slug === slug));
}

/** How many times the shortlist has been cleared since the page loaded, for whatever keeps entries of its own to forget them. */
export function useShortlistClears(): number {
  const store = useShortlistStore();
  return useSyncExternalStore(store.subscribe, store.clears);
}

export function therapistCount(n: number): string {
  return n === 1 ? "1 therapist" : `${n} therapists`;
}

/** Keeps shortlisted therapists' cards as fresh as the results in front of the visitor. */
export function useShortlistRefresh(therapists: readonly TherapistCard[]) {
  const store = useShortlistStore();
  useEffect(() => store.refresh(therapists), [store, therapists]);
}
