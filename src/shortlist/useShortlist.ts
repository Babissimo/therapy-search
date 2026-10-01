import { createContext, useContext, useEffect, useMemo, useSyncExternalStore } from "react";
import type { TherapistCard } from "@shared/types";
import { browserStorage } from "@/lib/storage";
import { createShortlistStore, statusOf, type Shortlist, type ShortlistEntry, type ShortlistStore, type Status } from "./store";

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

/**
 * Who the results map picks out while `wanted`: the shortlist less those set aside, as a set that changes only as someone
 * joins or leaves it, not as the list is reordered or a status changes within it.
 */
export function useShortlistedSlugs(wanted: boolean): ReadonlySet<string> {
  const members = useShortlistIf(wanted)
    .filter((entry) => statusOf(entry) !== "setAside")
    .map((entry) => entry.card.slug)
    .sort()
    .join(" ");
  return useMemo(() => (members ? new Set(members.split(" ")) : NO_SLUGS), [members]);
}

export function useShortlistEntry(slug: string): ShortlistEntry | undefined {
  const store = useShortlistStore();
  return useSyncExternalStore(store.subscribe, () => store.get().find((entry) => entry.card.slug === slug));
}

/** Where the visitor stands with a therapist, or nothing while they aren't shortlisted; a reorder leaves it, and its readers, alone. */
export function useShortlistStatus(slug: string): Status | undefined {
  const store = useShortlistStore();
  return useSyncExternalStore(store.subscribe, () => {
    const entry = store.get().find((e) => e.card.slug === slug);
    return entry && statusOf(entry);
  });
}

export function therapistCount(n: number): string {
  return n === 1 ? "1 therapist" : `${n} therapists`;
}

/** Keeps shortlisted therapists' cards as fresh as the results in front of the visitor. */
export function useShortlistRefresh(therapists: readonly TherapistCard[]) {
  const store = useShortlistStore();
  useEffect(() => store.refresh(therapists), [store, therapists]);
}
