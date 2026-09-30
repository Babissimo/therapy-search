import { createContext, useContext, useEffect, useSyncExternalStore } from "react";
import type { TherapistCard } from "@shared/types";
import { browserStorage } from "@/lib/storage";
import { createShortlistStore, type Shortlist, type ShortlistStore } from "./store";

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

/** Whether anyone is on the shortlist, which changes far less often than who is. */
export function useHasShortlist(): boolean {
  const store = useShortlistStore();
  return useSyncExternalStore(store.subscribe, () => store.get().length > 0);
}

export function useShortlisted(slug: string): boolean {
  const store = useShortlistStore();
  return useSyncExternalStore(store.subscribe, () => store.has(slug));
}

export function therapistCount(n: number): string {
  return n === 1 ? "1 therapist" : `${n} therapists`;
}

/** Keeps shortlisted therapists' cards as fresh as the results in front of the visitor. */
export function useShortlistRefresh(therapists: readonly TherapistCard[]) {
  const store = useShortlistStore();
  useEffect(() => store.refresh(therapists), [store, therapists]);
}
