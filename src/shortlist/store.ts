import type { TherapistCard } from "@shared/types";
import { safeUrl } from "@shared/ukcp/text";

export const SHORTLIST_KEY = "shortlist";

/** A card as a search showed it, less its distance, which only meant something from that search's place. */
export type ShortlistCard = Omit<TherapistCard, "distance">;
export type ShortlistEntry = { addedAt: number; card: ShortlistCard };

/** Newest first, as UKCP lists its own. */
export type Shortlist = readonly ShortlistEntry[];

type Entries = ReadonlyMap<string, ShortlistEntry>;
type Stored = { v: 1; entries: Record<string, ShortlistEntry> };
type KeyValue = Pick<Storage, "getItem" | "setItem">;
type Events = Pick<EventTarget, "addEventListener" | "removeEventListener">;

export type ShortlistStore = {
  get: () => Shortlist;
  has: (slug: string) => boolean;
  /** `addedAt` puts back a therapist just removed in the place they had. */
  add: (card: ShortlistCard, addedAt?: number) => void;
  remove: (slug: string) => void;
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
    const { key } = event as StorageEvent;
    // A null key means the other tab cleared all storage.
    if (key !== SHORTLIST_KEY && key !== null) return;
    entries = stored(storage) ?? entries;
    notify();
  };

  return {
    get: () => list,
    has: (slug) => entries.has(slug),
    add: (card, addedAt = now()) => update((next) => void next.set(card.slug, { addedAt, card: cardOf(card) })),
    remove: (slug) => update((next) => void next.delete(slug)),
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
  return [...entries.values()].sort((a, b) => b.addedAt - a.addedAt);
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

/** An entry as this site wrote it, or nothing; the photo link is checked again because it becomes an image's source. */
function entryFrom(value: unknown): ShortlistEntry | undefined {
  if (!isRecord(value) || typeof value.addedAt !== "number" || !isRecord(value.card)) return undefined;
  const c = value.card;
  if (typeof c.slug !== "string" || typeof c.name !== "string" || typeof c.initials !== "string") return undefined;
  if (!Array.isArray(c.tags) || !c.tags.every((tag) => typeof tag === "string")) return undefined;
  return {
    addedAt: value.addedAt,
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

function text(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
