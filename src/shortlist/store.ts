import type { TherapistCard } from "@shared/types";
import { safeUrl } from "@shared/ukcp/text";

export const SHORTLIST_KEY = "shortlist";

/** Where the visitor stands with a shortlisted therapist, in the order a search usually runs through them. */
export const STATUSES = ["toContact", "contacted", "waiting", "consultation", "seeing", "setAside"] as const;
export type Status = (typeof STATUSES)[number];
/** "To contact" is where a bookmark puts a therapist, so it is stored as no status at all. */
type StoredStatus = Exclude<Status, "toContact">;

/** A card as a search showed it, less its distance, which only meant something from that search's place. */
export type ShortlistCard = Omit<TherapistCard, "distance">;
/** `rank` is set once the visitor moves them; until then they are ranked by when they were added. */
export type ShortlistEntry = { addedAt: number; rank?: number; status?: StoredStatus; card: ShortlistCard };

/** Highest rank first: newest first, as UKCP lists its own, until the visitor rearranges it. */
export type Shortlist = readonly ShortlistEntry[];

/** The neighbours a therapist is moved between, as listed; either is missing at an end of the list. */
type Between = { above?: ShortlistEntry; below?: ShortlistEntry };

type Entries = ReadonlyMap<string, ShortlistEntry>;
type Stored = { v: 1; entries: Record<string, ShortlistEntry> };
type KeyValue = Pick<Storage, "getItem" | "setItem" | "removeItem">;
type Events = Pick<EventTarget, "addEventListener" | "removeEventListener">;

export type ShortlistStore = {
  get: () => Shortlist;
  has: (slug: string) => boolean;
  /** `place`, the entry a therapist just removed had, puts them back where and as they were; a status alone adds them with it. */
  add: (card: ShortlistCard, place?: Partial<Omit<ShortlistEntry, "card">>) => void;
  remove: (slug: string) => void;
  /** Takes everyone off, with their statuses and order, for a browser someone else may use next. */
  clear: () => void;
  /**
   * How many times the list has been cleared, here or in another tab, since the page loaded. Whatever keeps entries of
   * its own, to put a therapist back, forgets them as this changes.
   */
  clears: () => number;
  move: (slug: string, between: Between) => void;
  /** Leaves their place in the order alone, so the visitor's preference carries from one status to the next. */
  setStatus: (slug: string, status: Status) => void;
  /** Brings shortlisted therapists' cards up to date from results the site has fetched anyway. */
  refresh: (cards: readonly TherapistCard[]) => void;
  subscribe: (onChange: () => void) => () => void;
};

/**
 * The therapists a visitor has shortlisted, kept in this browser alone. The list is held in memory as well as storage, so
 * where storage is refused it still lasts for the page load. `events` is where another tab's changes are heard.
 */
export function createShortlistStore(storage: KeyValue | null, now: () => number = Date.now, events?: Events): ShortlistStore {
  let entries: Entries = stored(storage) ?? new Map();
  let list = ordered(entries);
  // Whether storage holds the list in memory; once a write is refused, only memory does.
  let persisted = true;
  let clears = 0;
  const listeners = new Set<() => void>();

  const notify = () => {
    list = ordered(entries);
    for (const listener of listeners) listener();
  };
  // Starts from the list as stored rather than as last heard, so another tab's change not yet heard of survives.
  const update = (change: (next: Map<string, ShortlistEntry>) => void) => {
    const next = new Map((persisted && stored(storage)) || entries);
    change(next);
    entries = next;
    persisted = write(storage, entries);
    notify();
  };
  const onStorage = (event: Event) => {
    const { key, newValue, storageArea } = event as StorageEvent;
    if (storageArea && storageArea !== storage) return;
    // A null key means the other tab cleared all storage.
    if (key !== SHORTLIST_KEY && key !== null) return;
    // Only a clear takes the list out of storage. Storage is still read, as this tab may have written to it since.
    if (newValue === null) clears += 1;
    entries = stored(storage) ?? (newValue === null ? new Map() : entries);
    notify();
  };

  return {
    get: () => list,
    has: (slug) => entries.has(slug),
    add: (card, place) =>
      update((next) => void next.set(card.slug, { addedAt: place?.addedAt ?? now(), rank: place?.rank, status: place?.status, card: cardOf(card) })),
    remove: (slug) => update((next) => void next.delete(slug)),
    // Takes the list out of storage, which leaves nothing behind and is how other tabs know it was cleared.
    clear: () => {
      clears += 1;
      entries = new Map();
      persisted = erase(storage);
      notify();
    },
    clears: () => clears,
    move: (slug, between) =>
      update((next) => {
        const entry = next.get(slug);
        if (!entry) return;
        let rank = rankBetween(between, next, now);
        // Halving one gap again and again wears it below what a number can split; spread out, there is room again.
        if (!fitsBetween(rank, between, next)) {
          spread(next);
          rank = rankBetween(between, next, now);
        }
        next.set(slug, { ...entry, rank });
      }),
    setStatus: (slug, status) =>
      update((next) => {
        const entry = next.get(slug);
        if (entry) next.set(slug, { ...entry, status: status === "toContact" ? undefined : status });
      }),
    refresh: (cards) => {
      // Runs whenever results render, so only shortlisted therapists' cards are copied and compared.
      const changed = cards.filter((fresh) => {
        const entry = entries.get(fresh.slug);
        return entry !== undefined && JSON.stringify(entry.card) !== JSON.stringify(cardOf(fresh));
      });
      if (changed.length === 0) return;
      update((next) => {
        for (const fresh of changed) {
          const entry = next.get(fresh.slug);
          if (entry) next.set(fresh.slug, { ...entry, card: cardOf(fresh) });
        }
      });
    },
    subscribe: (onChange) => {
      if (listeners.size === 0) events?.addEventListener("storage", onStorage);
      listeners.add(onChange);
      return () => {
        listeners.delete(onChange);
        if (listeners.size === 0) events?.removeEventListener("storage", onStorage);
      };
    },
  };
}

function ordered(entries: Entries): Shortlist {
  return [...entries.values()].sort(byRank);
}

export function byRank(a: ShortlistEntry, b: ShortlistEntry): number {
  return rankOf(b) - rankOf(a);
}

export function statusOf(entry: ShortlistEntry): Status {
  return entry.status ?? "toContact";
}

function rankOf(entry: ShortlistEntry): number {
  return entry.rank ?? entry.addedAt;
}

/** Midway between the neighbours; at the top, the time of the move, so anyone added later still goes above. */
function rankBetween({ above, below }: Between, entries: Entries, now: () => number): number {
  const rank = (neighbour: ShortlistEntry) => rankOf(current(neighbour, entries));
  if (above && below) return (rank(above) + rank(below)) / 2;
  if (below) return Math.max(now(), rank(below) + 1);
  return above ? rank(above) - 1 : now();
}

function fitsBetween(rank: number, { above, below }: Between, entries: Entries): boolean {
  return (!above || rank < rankOf(current(above, entries))) && (!below || rank > rankOf(current(below, entries)));
}

/** A neighbour as the store now holds them, where still listed, as spreading may have lowered them. */
function current(neighbour: ShortlistEntry, entries: Entries): ShortlistEntry {
  return entries.get(neighbour.card.slug) ?? neighbour;
}

/** Lowers ranks where needed so each is at least a millisecond below the one above, keeping their order. */
function spread(entries: Map<string, ShortlistEntry>) {
  let floor = Infinity;
  for (const entry of ordered(entries)) {
    const rank = Math.min(rankOf(entry), floor - 1);
    if (rank !== rankOf(entry)) entries.set(entry.card.slug, { ...entry, rank });
    floor = rank;
  }
}

/** The card's own fields in a fixed order, so two copies of the same card compare equal as JSON. */
function cardOf(t: ShortlistCard): ShortlistCard {
  return {
    slug: t.slug,
    name: t.name,
    initials: t.initials,
    photoUrl: t.photoUrl,
    location: t.location,
    sessionTypes: t.sessionTypes,
    summary: t.summary,
    tags: t.tags,
  };
}

/** The list as stored, or nothing where storage is refused; a value it can't read counts as an empty list. */
function stored(storage: KeyValue | null): Entries | undefined {
  if (!storage) return undefined;
  let raw: string | null;
  try {
    raw = storage.getItem(SHORTLIST_KEY);
  } catch {
    return undefined;
  }
  const entries = new Map<string, ShortlistEntry>();
  let value: unknown;
  try {
    value = JSON.parse(raw ?? "null");
  } catch {
    return entries;
  }
  if (!isRecord(value) || value.v !== 1 || !isRecord(value.entries)) return entries;
  for (const [slug, item] of Object.entries(value.entries)) {
    const entry = entryFrom(item);
    if (entry?.card.slug === slug) entries.set(slug, entry);
  }
  return entries;
}

/** Whether storage took the list; private browsing can refuse it. */
function write(storage: KeyValue | null, entries: Entries): boolean {
  const value: Stored = { v: 1, entries: Object.fromEntries(entries) };
  try {
    storage?.setItem(SHORTLIST_KEY, JSON.stringify(value));
    return storage !== null;
  } catch {
    return false;
  }
}

/** Whether storage let go of the list. */
function erase(storage: KeyValue | null): boolean {
  try {
    storage?.removeItem(SHORTLIST_KEY);
    return storage !== null;
  } catch {
    return false;
  }
}

/** An entry as this site wrote it, or nothing; the photo link is checked again because it becomes an image's source. */
function entryFrom(value: unknown): ShortlistEntry | undefined {
  if (!isRecord(value) || typeof value.addedAt !== "number" || !isRecord(value.card)) return undefined;
  const c = value.card;
  if (typeof c.slug !== "string" || typeof c.name !== "string" || typeof c.initials !== "string") return undefined;
  if (!Array.isArray(c.tags) || !c.tags.every((tag) => typeof tag === "string")) return undefined;
  return {
    addedAt: value.addedAt,
    rank: typeof value.rank === "number" ? value.rank : undefined,
    status: storedStatus(value.status),
    card: cardOf({
      slug: c.slug,
      name: c.name,
      initials: c.initials,
      photoUrl: safeUrl(text(c.photoUrl)),
      location: text(c.location),
      sessionTypes: text(c.sessionTypes),
      summary: text(c.summary),
      tags: c.tags,
    }),
  };
}

/** A status this site stores, or nothing, which reads as "To contact". */
function storedStatus(value: unknown): StoredStatus | undefined {
  return STATUSES.some((status) => status !== "toContact" && status === value) ? (value as StoredStatus) : undefined;
}

function text(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
