import type { TherapistCard } from "@shared/types";
import { safeUrl } from "@shared/ukcp/text";

export const SHORTLIST_KEY = "shortlist";

/** The most a note holds. */
export const NOTE_LIMIT = 1000;

/** How long a removed therapist is kept, to be added back as they were. */
export const REMOVED_DAYS = 30;
const DAY = 24 * 60 * 60 * 1000;

/** The most a draft's subject and message hold. */
export const SUBJECT_LIMIT = 200;
export const MESSAGE_LIMIT = 5000;
/** The most each of the visitor's own fields holds. */
export const SENDER_LIMIT = 200;
/** The longest found-by search kept, above what a search with every filter ticked makes. */
export const SEARCH_LIMIT = 12_000;

/** Where the visitor stands with a shortlisted therapist, in the order a search usually runs through them. */
export const STATUSES = ["toContact", "contacted", "waiting", "consultation", "seeing", "setAside"] as const;
export type Status = (typeof STATUSES)[number];
/** "To contact" is where a bookmark puts a therapist, so it is stored as no status at all. */
type StoredStatus = Exclude<Status, "toContact">;

/** A card as a search showed it, less its distance, which only meant something from that search's place. */
export type ShortlistCard = Omit<TherapistCard, "distance">;
/**
 * `rank` is set once the visitor moves them; until then they are ranked by when they were added. `note` is the visitor's
 * own, written on the profile. `search` is the query of the search they were shortlisted from, and `draft` the visitor's
 * email to them once edited by hand.
 */
export type ShortlistEntry = {
  addedAt: number;
  rank?: number;
  status?: StoredStatus;
  note?: string;
  search?: string;
  draft?: EmailDraft;
  card: ShortlistCard;
};

export type EmailDraft = { subject: string; message: string };

/** The visitor's name and when they're usually free, which every draft signs and offers. */
export type Sender = { name?: string; free?: string };

/** Highest rank first: newest first, as UKCP lists its own, until the visitor rearranges it. */
export type Shortlist = readonly ShortlistEntry[];

/** The neighbours a therapist is moved between, as listed; either is missing at an end of the list. */
export type Between = { above?: ShortlistEntry; below?: ShortlistEntry };

/** A therapist taken off the list, with when, kept to be added back as they were. */
type RemovedEntry = ShortlistEntry & { removedAt: number };

type Entries = ReadonlyMap<string, ShortlistEntry>;
type Removed = ReadonlyMap<string, RemovedEntry>;
type State = { entries: Entries; removed: Removed; sender?: Sender };
type Stored = { v: 1; entries: Record<string, ShortlistEntry>; removed: Record<string, RemovedEntry>; sender?: Sender };
type KeyValue = Pick<Storage, "getItem" | "setItem" | "removeItem">;
type Events = Pick<EventTarget, "addEventListener" | "removeEventListener">;

export type ShortlistStore = {
  get: () => Shortlist;
  has: (slug: string) => boolean;
  /**
   * Puts anyone removed back where and as they were, note and card and all, with whatever `place` gives over that. Anyone
   * listed already keeps what they have the same way. Returns where the visitor then stands with them.
   */
  add: (card: ShortlistCard, place?: Partial<Omit<ShortlistEntry, "card">>) => Status;
  /** Keeps the therapist, to be added back as they were, until the list is cleared or a page loads `REMOVED_DAYS` days or more after. */
  remove: (slug: string) => void;
  /** Takes everyone off, those removed too, with their statuses, notes and order, for a browser someone else may use next. */
  clear: () => void;
  /**
   * How many times the list has been cleared, here or in another tab, since the page loaded. Whatever shows removed
   * therapists of its own, to be put back, lets them go as this changes.
   */
  clears: () => number;
  /** How many removed therapists are kept to be added back. */
  removedCount: () => number;
  move: (slug: string, between: Between) => void;
  /** Leaves their place in the order alone, so the visitor's preference carries from one status to the next. */
  setStatus: (slug: string, status: Status) => void;
  /** Keeps the first `NOTE_LIMIT` characters, and an empty note as none, for a removed therapist too. */
  setNote: (slug: string, note: string) => void;
  /** Keeps the visitor's edited draft to a therapist, removed or not; none forgets it. */
  setDraft: (slug: string, draft: EmailDraft | undefined) => void;
  /** The visitor's own fields, or nothing while neither is given. */
  sender: () => Sender | undefined;
  setSender: (sender: Sender) => void;
  /** Brings shortlisted therapists' cards up to date from results the site has fetched anyway. */
  refresh: (cards: readonly TherapistCard[]) => void;
  subscribe: (onChange: () => void) => () => void;
};

/**
 * The therapists a visitor has shortlisted, kept in this browser alone. The list is held in memory as well as storage, so
 * where storage is refused it still lasts for the page load. `events` is where another tab's changes are heard.
 */
export function createShortlistStore(storage: KeyValue | null, now: () => number = Date.now, events?: Events): ShortlistStore {
  let { entries, removed, sender } = stored(storage) ?? NOBODY;
  // Whether storage holds the list in memory; once a write is refused, only memory does.
  let persisted = true;
  // Those removed too long ago are forgotten as the page loads, in storage as well as here.
  if (removed.size > 0) {
    const since = now() - REMOVED_DAYS * DAY;
    const recent = new Map([...removed].filter(([, entry]) => entry.removedAt > since));
    if (recent.size < removed.size) {
      removed = recent;
      persisted = write(storage, { entries, removed, sender });
    }
  }
  let list = ordered(entries);
  let clears = 0;
  const listeners = new Set<() => void>();

  const notify = () => {
    list = ordered(entries);
    for (const listener of listeners) listener();
  };
  // Starts from the list as stored rather than as last heard, so another tab's change not yet heard of survives. A change
  // that returns a sender replaces the visitor's fields; any other keeps them as stored.
  const update = (change: (next: Map<string, ShortlistEntry>, gone: Map<string, RemovedEntry>) => { sender: Sender | undefined } | void) => {
    const from = (persisted && stored(storage)) || { entries, removed, sender };
    const next = new Map(from.entries);
    const gone = new Map(from.removed);
    const made = change(next, gone);
    entries = next;
    removed = gone;
    sender = made ? made.sender : from.sender;
    persisted = write(storage, { entries, removed, sender });
    notify();
  };
  const onStorage = (event: Event) => {
    const { key, newValue, storageArea } = event as StorageEvent;
    if (storageArea && storageArea !== storage) return;
    // A null key means the other tab cleared all storage.
    if (key !== SHORTLIST_KEY && key !== null) return;
    // Only a clear takes the list out of storage. Storage is still read, as this tab may have written to it since.
    if (newValue === null) clears += 1;
    ({ entries, removed, sender } = stored(storage) ?? (newValue === null ? NOBODY : { entries, removed, sender }));
    notify();
  };
  // What another tab did while no one here was subscribed went unheard, a clear among them, so the first to subscribe
  // again catches up. Anyone gone from the list meanwhile may have gone in a clear, so counts as one.
  const catchUp = () => {
    const inStorage = persisted ? stored(storage) : undefined;
    const snapshot = (state: State) => JSON.stringify([...state.entries, ...state.removed, state.sender ?? null]);
    if (!inStorage || snapshot(inStorage) === snapshot({ entries, removed, sender })) return;
    if ([...entries.keys()].some((slug) => !inStorage.entries.has(slug))) clears += 1;
    ({ entries, removed, sender } = inStorage);
    list = ordered(entries);
  };

  return {
    get: () => list,
    has: (slug) => entries.has(slug),
    add: (card, place) => {
      update((next, gone) => {
        // Listed already, as by another tab this one has yet to hear from, they are not started afresh.
        const kept = next.get(card.slug) ?? gone.get(card.slug);
        gone.delete(card.slug);
        const { addedAt = now(), rank, status, note, draft } = { ...kept, ...place };
        // The newer search where one is given, as the one the visitor last found them by.
        const search = searchFrom(place?.search) ?? kept?.search;
        next.set(card.slug, { addedAt, rank, status, note: noteFrom(note), search, draft: draftFrom(draft), card: cardOf(kept?.card ?? card) });
      });
      return statusOf(entries.get(card.slug)!);
    },
    remove: (slug) =>
      update((next, gone) => {
        const entry = next.get(slug);
        if (!entry) return;
        next.delete(slug);
        gone.set(slug, { ...entry, removedAt: now() });
      }),
    // Takes the list out of storage, which leaves nothing behind and is how other tabs know it was cleared.
    clear: () => {
      clears += 1;
      ({ entries, removed, sender } = NOBODY);
      persisted = erase(storage);
      notify();
    },
    clears: () => clears,
    removedCount: () => removed.size,
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
    setNote: (slug, note) =>
      update((next, gone) => {
        const entry = next.get(slug);
        if (entry) next.set(slug, { ...entry, note: noteFrom(note) });
        // A note the profile's box saves as it goes, after its therapist was removed, is kept with them.
        const kept = gone.get(slug);
        if (kept) gone.set(slug, { ...kept, note: noteFrom(note) });
      }),
    setDraft: (slug, draft) =>
      update((next, gone) => {
        const entry = next.get(slug);
        if (entry) next.set(slug, { ...entry, draft: draftFrom(draft) });
        const kept = gone.get(slug);
        if (kept) gone.set(slug, { ...kept, draft: draftFrom(draft) });
      }),
    sender: () => sender,
    setSender: (value) => update(() => ({ sender: senderFrom(value) })),
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
      if (listeners.size === 0 && events) {
        catchUp();
        events.addEventListener("storage", onStorage);
      }
      listeners.add(onChange);
      return () => {
        listeners.delete(onChange);
        if (listeners.size === 0) events?.removeEventListener("storage", onStorage);
      };
    },
  };
}

const NOBODY: State = { entries: new Map(), removed: new Map() };

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
function stored(storage: KeyValue | null): State | undefined {
  if (!storage) return undefined;
  let raw: string | null;
  try {
    raw = storage.getItem(SHORTLIST_KEY);
  } catch {
    return undefined;
  }
  const entries = new Map<string, ShortlistEntry>();
  const removed = new Map<string, RemovedEntry>();
  let value: unknown;
  try {
    value = JSON.parse(raw ?? "null");
  } catch {
    return { entries, removed };
  }
  if (!isRecord(value) || value.v !== 1 || !isRecord(value.entries)) return { entries, removed };
  for (const [slug, item] of Object.entries(value.entries)) {
    const entry = entryFrom(item);
    if (entry?.card.slug === slug) entries.set(slug, entry);
  }
  // A list written before removed therapists were kept has none.
  for (const [slug, item] of Object.entries(isRecord(value.removed) ? value.removed : {})) {
    const entry = removedFrom(item);
    if (entry?.card.slug === slug && !entries.has(slug)) removed.set(slug, entry);
  }
  return { entries, removed, sender: senderFrom(value.sender) };
}

/** Whether storage took the list; private browsing can refuse it. */
function write(storage: KeyValue | null, { entries, removed, sender }: State): boolean {
  const value: Stored = { v: 1, entries: Object.fromEntries(entries), removed: Object.fromEntries(removed), sender };
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
    note: noteFrom(value.note),
    search: searchFrom(value.search),
    draft: draftFrom(value.draft),
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

/** A removed therapist's entry as this site wrote it, with when they were removed, or nothing. */
function removedFrom(value: unknown): RemovedEntry | undefined {
  const entry = entryFrom(value);
  return entry && isRecord(value) && typeof value.removedAt === "number" ? { ...entry, removedAt: value.removedAt } : undefined;
}

/** A status this site stores, or nothing, which reads as "To contact". */
function storedStatus(value: unknown): StoredStatus | undefined {
  return STATUSES.some((status) => status !== "toContact" && status === value) ? (value as StoredStatus) : undefined;
}

/** A note as kept: no more than `NOTE_LIMIT` characters, and none where nothing is written or it isn't text. */
function noteFrom(value: unknown): string | undefined {
  return typeof value === "string" && value !== "" ? value.slice(0, NOTE_LIMIT) : undefined;
}

/** A found-by search as kept, or none where it isn't one. */
function searchFrom(value: unknown): string | undefined {
  return typeof value === "string" && value !== "" && value.length <= SEARCH_LIMIT ? value : undefined;
}

/** A draft as kept, each part held to its limit, or none where it isn't one. */
function draftFrom(value: unknown): EmailDraft | undefined {
  if (!isRecord(value) || typeof value.subject !== "string" || typeof value.message !== "string") return undefined;
  return { subject: value.subject.slice(0, SUBJECT_LIMIT), message: value.message.slice(0, MESSAGE_LIMIT) };
}

/** The visitor's fields as kept, each held to its limit, an empty one as none, and none at all where neither is given. */
function senderFrom(value: unknown): Sender | undefined {
  if (!isRecord(value)) return undefined;
  const field = (text: unknown) => (typeof text === "string" && text !== "" ? text.slice(0, SENDER_LIMIT) : undefined);
  const name = field(value.name);
  const free = field(value.free);
  return name === undefined && free === undefined ? undefined : { name, free };
}

function text(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
