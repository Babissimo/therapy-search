import { createContext, useContext, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import type { TherapistCard } from "@shared/types";
import { browserStorage } from "@/lib/storage";
import {
  createShortlistStore,
  statusOf,
  type EmailDraft,
  type Sender,
  type Shortlist,
  type ShortlistEntry,
  type ShortlistStore,
  type Status,
} from "./store";

/** The store the page's components share; left unset, it is the one kept in this browser. */
export const ShortlistContext = createContext<ShortlistStore | null>(null);

let browserStore: ShortlistStore | undefined;

/** The store kept in this browser, made the first time it is asked for. */
export function browserShortlist(): ShortlistStore {
  return (browserStore ??= createShortlistStore(browserStorage(), Date.now, window));
}

export function useShortlistStore(): ShortlistStore {
  return useContext(ShortlistContext) ?? browserShortlist();
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

const NO_STATUSES: ReadonlyMap<string, Status> = new Map();

/**
 * Where the visitor stands with each shortlisted therapist past "To contact", while `wanted`, as a map that changes only as
 * one of those statuses does, not as the list is reordered.
 */
export function useShortlistStatuses(wanted: boolean): ReadonlyMap<string, Status> {
  const marked = JSON.stringify(
    useShortlistIf(wanted)
      .filter((entry) => statusOf(entry) !== "toContact")
      .map((entry) => [entry.card.slug, statusOf(entry)])
      .sort(),
  );
  return useMemo(() => (marked === "[]" ? NO_STATUSES : new Map(JSON.parse(marked) as [string, Status][])), [marked]);
}

/** Whether anyone is shortlisted, set aside or not; any other change to the list leaves it, and its readers, alone. */
export function useAnyShortlisted(): boolean {
  const store = useShortlistStore();
  return useSyncExternalStore(store.subscribe, () => store.get().length > 0);
}

export function useShortlistEntry(slug: string): ShortlistEntry | undefined {
  const store = useShortlistStore();
  return useSyncExternalStore(store.subscribe, () => store.get().find((entry) => entry.card.slug === slug));
}

/** Whether a therapist is shortlisted; a change to their entry leaves it, and its readers, alone. */
export function useShortlisted(slug: string): boolean {
  const store = useShortlistStore();
  return useSyncExternalStore(store.subscribe, () => store.has(slug));
}

/** Where the visitor stands with a therapist, or nothing while they aren't shortlisted; a reorder leaves it, and its readers, alone. */
export function useShortlistStatus(slug: string): Status | undefined {
  const store = useShortlistStore();
  return useSyncExternalStore(store.subscribe, () => {
    const entry = store.get().find((e) => e.card.slug === slug);
    return entry && statusOf(entry);
  });
}

/** The visitor's note on a therapist, or nothing written while they have none or aren't shortlisted. */
export function useShortlistNote(slug: string): string {
  const store = useShortlistStore();
  return useSyncExternalStore(store.subscribe, () => store.get().find((e) => e.card.slug === slug)?.note ?? "");
}

/** The search a therapist was shortlisted from, as a query, or nothing where none was kept. */
export function useShortlistSearch(slug: string): string | undefined {
  const store = useShortlistStore();
  return useSyncExternalStore(store.subscribe, () => store.get().find((e) => e.card.slug === slug)?.search);
}

/** The visitor's email to a therapist, once edited by hand, or nothing. */
export function useShortlistDraft(slug: string): EmailDraft | undefined {
  const store = useShortlistStore();
  return useSyncExternalStore(store.subscribe, () => store.get().find((e) => e.card.slug === slug)?.draft);
}

const NO_SENDER: Sender = {};

/** The visitor's name and when they're usually free, as one value that changes only as either does. */
export function useShortlistSender(): Sender {
  const store = useShortlistStore();
  const name = useSyncExternalStore(store.subscribe, () => store.sender()?.name);
  const free = useSyncExternalStore(store.subscribe, () => store.sender()?.free);
  return useMemo(() => (name === undefined && free === undefined ? NO_SENDER : { name, free }), [name, free]);
}

/**
 * What a polite live region says of a change the visitor made, given once the change is made. It is said until the list next
 * changes, here or in another tab, so the same words said again after an undo are heard again.
 */
export function useShortlistAnnouncement(): [string, (text: string) => void] {
  const store = useShortlistStore();
  const [made, setMade] = useState<{ text: string; after?: Shortlist }>({ text: "" });
  const holds = useSyncExternalStore(store.subscribe, () => made.after === store.get());
  return [holds ? made.text : "", (text) => setMade({ text, after: store.get() })];
}

/** How many times the shortlist has been cleared since the page loaded, for whatever keeps entries of its own to forget them. */
export function useShortlistClears(): number {
  const store = useShortlistStore();
  return useSyncExternalStore(store.subscribe, store.clears);
}

/** How many removed therapists the shortlist keeps, to be added back as they were. */
export function useShortlistRemoved(): number {
  const store = useShortlistStore();
  return useSyncExternalStore(store.subscribe, store.removedCount);
}

export function therapistCount(n: number): string {
  return n === 1 ? "1 therapist" : `${n} therapists`;
}

/** Keeps shortlisted therapists' cards as fresh as the results in front of the visitor. */
export function useShortlistRefresh(therapists: readonly TherapistCard[]) {
  const store = useShortlistStore();
  useEffect(() => store.refresh(therapists), [store, therapists]);
}
