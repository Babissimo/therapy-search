// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import type { TherapistCard } from "@shared/types";
import { createShortlistStore, MESSAGE_LIMIT, NOTE_LIMIT, REMOVED_DAYS, SEARCH_LIMIT, SENDER_LIMIT, SHORTLIST_KEY, statusOf, SUBJECT_LIMIT } from "./store";

function memory(initial?: unknown) {
  const store = new Map<string, string>(initial === undefined ? [] : [[SHORTLIST_KEY, typeof initial === "string" ? initial : JSON.stringify(initial)]]);
  return {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
    store,
  };
}

const card = (slug: string, extra: Partial<TherapistCard> = {}): TherapistCard => ({
  slug,
  name: `Name of ${slug}`,
  initials: "NO",
  location: "Leeds LS1",
  distance: "1 mile from Leeds",
  summary: "Summary text.",
  tags: ["Anxiety"],
  ...extra,
});

function clock(start = 1000) {
  let t = start;
  return () => t++;
}

describe("createShortlistStore", () => {
  it("starts empty when nothing, or nothing it can read, is stored", () => {
    expect(createShortlistStore(memory()).get()).toEqual([]);
    expect(createShortlistStore(memory("not json")).get()).toEqual([]);
    expect(createShortlistStore(memory({ v: 99, entries: {} })).get()).toEqual([]);
    expect(createShortlistStore(null).get()).toEqual([]);
  });

  it("lists therapists newest first, keeping their cards without the distance from a search", () => {
    const store = createShortlistStore(memory(), clock());
    store.add(card("a"));
    store.add(card("b"));
    expect(store.get().map((e) => e.card.slug)).toEqual(["b", "a"]);
    expect(store.get()[0]).toEqual({ addedAt: 1001, card: { ...card("b"), distance: undefined } });
    expect("distance" in store.get()[0]!.card).toBe(false);
    expect(store.has("a")).toBe(true);
  });

  it("moves a therapist between two others, to either end, and keeps the order for the next visit", () => {
    const storage = memory();
    const store = createShortlistStore(storage, clock());
    for (const slug of ["a", "b", "c"]) store.add(card(slug));
    const slugs = () => store.get().map((e) => e.card.slug);
    const at = (slug: string) => store.get().find((e) => e.card.slug === slug);
    store.move("a", { above: at("c"), below: at("b") });
    expect(slugs()).toEqual(["c", "a", "b"]);
    store.move("b", { below: at("c") });
    expect(slugs()).toEqual(["b", "c", "a"]);
    store.move("b", { above: at("a") });
    expect(slugs()).toEqual(["c", "a", "b"]);
    expect(createShortlistStore(storage).get().map((e) => e.card.slug)).toEqual(["c", "a", "b"]);
  });

  it("still moves a therapist into place after the same gap has been halved past what a number can hold", () => {
    const store = createShortlistStore(memory(), clock());
    for (const slug of ["a", "b", "c", "d", "e"]) store.add(card(slug));
    for (let i = 0; i < 60; i++) {
      const [top, second] = store.get();
      const last = store.get().at(-1)!;
      store.move(last.card.slug, { above: top, below: second });
      expect(store.get()[1]?.card.slug).toBe(last.card.slug);
    }
  });

  it("leaves everyone else's rank alone while there is room between the neighbours", () => {
    const store = createShortlistStore(memory(), clock());
    for (const slug of ["a", "b", "c"]) store.add(card(slug));
    store.move("a", { above: store.get()[0], below: store.get()[1] });
    const others = store.get().slice(0, 2);
    store.move("b", { below: store.get()[0] });
    expect(store.get().slice(1)).toEqual(others);
  });

  it("lists a therapist added after a move above everyone", () => {
    const store = createShortlistStore(memory(), clock());
    store.add(card("a"));
    store.add(card("b"));
    store.move("a", { below: store.get()[0] });
    store.add(card("c"));
    expect(store.get().map((e) => e.card.slug)).toEqual(["c", "a", "b"]);
  });

  it("puts a therapist back where they were, moved or not, when given the entry they had", () => {
    const store = createShortlistStore(memory(), clock());
    for (const slug of ["a", "b", "c"]) store.add(card(slug));
    store.move("c", { above: store.get()[2] });
    const before = store.get();
    for (const entry of before) {
      store.remove(entry.card.slug);
      expect(store.has(entry.card.slug)).toBe(false);
      store.add(entry.card, entry);
    }
    expect(store.get().map((e) => e.card.slug)).toEqual(["b", "a", "c"]);
  });

  it("keeps the list for the next visit", () => {
    const storage = memory();
    createShortlistStore(storage, clock()).add(card("a"));
    expect(createShortlistStore(storage).get().map((e) => e.card.slug)).toEqual(["a"]);
  });

  it("drops stored entries it can't read, and photo links and ranks that it can't use", () => {
    const stored = {
      v: 1,
      entries: {
        good: { addedAt: 1, rank: "top", card: { slug: "good", name: "Good", initials: "G", photoUrl: "javascript:alert(1)", tags: ["Anxiety"] } },
        noName: { addedAt: 2, card: { slug: "noName", initials: "N", tags: [] } },
        noTime: { card: { slug: "noTime", name: "No time", initials: "N", tags: [] } },
        badTags: { addedAt: 3, card: { slug: "badTags", name: "Bad tags", initials: "B", tags: "Anxiety" } },
      },
    };
    const entries = createShortlistStore(memory(stored)).get();
    expect(entries).toEqual([{ addedAt: 1, card: { slug: "good", name: "Good", initials: "G", tags: ["Anxiety"] } }]);
  });

  it("lasts for the page load when the browser refuses storage", () => {
    const refusing = {
      getItem: () => {
        throw new Error("denied");
      },
      setItem: () => {
        throw new Error("denied");
      },
      removeItem: () => {
        throw new Error("denied");
      },
    };
    const store = createShortlistStore(refusing, clock());
    expect(() => store.add(card("a"))).not.toThrow();
    expect(store.has("a")).toBe(true);
  });

  it("lasts for the page load when the browser reads storage but refuses writes", () => {
    const readOnly = {
      ...memory(),
      setItem: () => {
        throw new Error("quota");
      },
    };
    const store = createShortlistStore(readOnly, clock());
    store.add(card("a"));
    store.add(card("b"));
    expect(store.get().map((e) => e.card.slug)).toEqual(["b", "a"]);
  });

  it("returns the same list until it changes, and tells subscribers when it does", () => {
    const store = createShortlistStore(memory(), clock());
    const before = store.get();
    expect(store.get()).toBe(before);
    const onChange = vi.fn();
    const unsubscribe = store.subscribe(onChange);
    store.add(card("a"));
    expect(onChange).toHaveBeenCalledOnce();
    expect(store.get()).not.toBe(before);
    unsubscribe();
    store.remove("a");
    expect(onChange).toHaveBeenCalledOnce();
  });

  it("updates shortlisted therapists' cards from fresh results, leaving everyone else out", () => {
    const storage = memory();
    const store = createShortlistStore(storage, clock());
    store.add(card("a"));
    store.refresh([card("a", { name: "New name", photoUrl: "https://example.invalid/new.jpg" }), card("z")]);
    expect(store.get()).toEqual([{ addedAt: 1000, card: { ...card("a", { name: "New name", photoUrl: "https://example.invalid/new.jpg" }), distance: undefined } }]);
    expect(createShortlistStore(storage).get()[0]?.card.name).toBe("New name");
  });

  it("keeps a moved therapist's place when fresh results update their card", () => {
    const store = createShortlistStore(memory(), clock());
    store.add(card("a"));
    store.add(card("b"));
    store.move("b", { above: store.get()[1] });
    store.refresh([card("b", { name: "New name" })]);
    expect(store.get().map((e) => e.card.name)).toEqual(["Name of a", "New name"]);
  });

  it("changes nothing when fresh results match what it has", () => {
    const store = createShortlistStore(memory(), clock());
    store.add(card("a"));
    const before = store.get();
    const onChange = vi.fn();
    store.subscribe(onChange);
    store.refresh([card("a", { distance: "2 miles from York" })]);
    expect(store.get()).toBe(before);
    expect(onChange).not.toHaveBeenCalled();
  });

  it("keeps a change another tab made before this one has heard of it", () => {
    const storage = memory();
    const here = createShortlistStore(storage, clock());
    createShortlistStore(storage, clock(5000)).add(card("elsewhere"));
    here.add(card("here"));
    expect(createShortlistStore(storage).get().map((e) => e.card.slug)).toEqual(["elsewhere", "here"]);
    expect(here.has("elsewhere")).toBe(true);
  });

  it("stops listening for other tabs once no one is subscribed", () => {
    const events = new EventTarget();
    const add = vi.spyOn(events, "addEventListener");
    const remove = vi.spyOn(events, "removeEventListener");
    const store = createShortlistStore(memory(), clock(), events);
    const first = store.subscribe(() => {});
    const second = store.subscribe(() => {});
    expect(add).toHaveBeenCalledOnce();
    first();
    expect(remove).not.toHaveBeenCalled();
    second();
    expect(remove).toHaveBeenCalledOnce();
  });

  it("catches up with what another tab did while no one here was subscribed, counting anyone gone as a clear", () => {
    const storage = memory();
    const store = createShortlistStore(storage, clock(), new EventTarget());
    store.add(card("a"));
    const list = store.get();
    store.subscribe(() => {})();
    expect(store.get()).toBe(list);
    createShortlistStore(storage, clock(2000)).add(card("b"));
    store.subscribe(() => {})();
    expect(store.get().map((e) => e.card.slug)).toEqual(["b", "a"]);
    expect(store.clears()).toBe(0);
    // A clear, then a bookmark, leaves a list that doesn't say it was cleared.
    const elsewhere = createShortlistStore(storage, clock(3000));
    elsewhere.clear();
    elsewhere.add(card("c"));
    store.subscribe(() => {});
    expect(store.get().map((e) => e.card.slug)).toEqual(["c"]);
    expect(store.clears()).toBe(1);
  });

  it("follows changes made in another tab", () => {
    const storage = memory();
    const events = new EventTarget();
    const store = createShortlistStore(storage, clock(), events);
    const onChange = vi.fn();
    store.subscribe(onChange);
    createShortlistStore(storage, clock(5000)).add(card("elsewhere"));
    events.dispatchEvent(new StorageEvent("storage", { key: "theme" }));
    expect(onChange).not.toHaveBeenCalled();
    events.dispatchEvent(new StorageEvent("storage", { key: SHORTLIST_KEY, newValue: storage.store.get(SHORTLIST_KEY) }));
    expect(onChange).toHaveBeenCalledOnce();
    expect(store.has("elsewhere")).toBe(true);
  });

  it("records where the visitor stands with a therapist, and keeps it for the next visit", () => {
    const storage = memory();
    const store = createShortlistStore(storage, clock());
    store.add(card("a"));
    expect(statusOf(store.get()[0]!)).toBe("toContact");
    store.setStatus("a", "contacted");
    expect(statusOf(store.get()[0]!)).toBe("contacted");
    expect(statusOf(createShortlistStore(storage).get()[0]!)).toBe("contacted");
  });

  it("stores To contact as no status at all", () => {
    const storage = memory();
    const store = createShortlistStore(storage, clock());
    store.add(card("a"));
    store.setStatus("a", "waiting");
    store.setStatus("a", "toContact");
    expect(store.get()[0]?.status).toBeUndefined();
    expect(JSON.parse(storage.store.get(SHORTLIST_KEY)!).entries.a).not.toHaveProperty("status");
  });

  it("keeps a therapist's place as their status changes, and their status as they move", () => {
    const store = createShortlistStore(memory(), clock());
    for (const slug of ["a", "b", "c"]) store.add(card(slug));
    store.setStatus("b", "setAside");
    expect(store.get().map((e) => e.card.slug)).toEqual(["c", "b", "a"]);
    store.move("b", { above: store.get()[2] });
    expect(store.get().map((e) => [e.card.slug, statusOf(e)])).toEqual([
      ["c", "toContact"],
      ["a", "toContact"],
      ["b", "setAside"],
    ]);
  });

  it("keeps a therapist's status when fresh results update their card", () => {
    const store = createShortlistStore(memory(), clock());
    store.add(card("a"));
    store.setStatus("a", "seeing");
    store.refresh([card("a", { name: "New name" })]);
    expect(statusOf(store.get()[0]!)).toBe("seeing");
  });

  it("puts a therapist back with the status they had, or adds them with the one given", () => {
    const store = createShortlistStore(memory(), clock());
    store.add(card("a"));
    store.setStatus("a", "consultation");
    const [before] = store.get();
    store.remove("a");
    store.add(before!.card, before);
    expect(store.get()).toEqual([before]);
    store.add(card("b"), { status: "contacted" });
    // The clock read 1001 as "a" was removed.
    expect(store.get()[0]).toEqual({ addedAt: 1002, status: "contacted", card: { ...card("b"), distance: undefined } });
  });

  it("clears everyone, with their statuses and order, from storage as well as the page, counting the clear", () => {
    const storage = memory();
    const store = createShortlistStore(storage, clock());
    for (const slug of ["a", "b"]) store.add(card(slug));
    store.setStatus("a", "seeing");
    store.move("a", { below: store.get()[0] });
    const onChange = vi.fn();
    store.subscribe(onChange);
    expect(store.clears()).toBe(0);
    store.clear();
    expect(onChange).toHaveBeenCalledOnce();
    expect(store.clears()).toBe(1);
    expect(store.get()).toEqual([]);
    expect(store.has("a")).toBe(false);
    expect(storage.store.has(SHORTLIST_KEY)).toBe(false);
    store.add(card("c"));
    expect(createShortlistStore(storage).get().map((e) => e.card.slug)).toEqual(["c"]);
  });

  it("clears the list for the page load where the browser refuses storage", () => {
    const refusing = {
      getItem: () => null,
      setItem: () => {
        throw new Error("denied");
      },
      removeItem: () => {
        throw new Error("denied");
      },
    };
    const store = createShortlistStore(refusing, clock());
    store.add(card("a"));
    expect(() => store.clear()).not.toThrow();
    expect(store.get()).toEqual([]);
    store.add(card("b"));
    expect(store.get().map((e) => e.card.slug)).toEqual(["b"]);
  });

  it("clears a therapist another tab added before this one has heard of it", () => {
    const storage = memory();
    const here = createShortlistStore(storage, clock());
    here.add(card("here"));
    createShortlistStore(storage, clock(5000)).add(card("elsewhere"));
    here.clear();
    expect(createShortlistStore(storage).get()).toEqual([]);
  });

  it("counts a clear made in another tab, as the list leaving storage, and no other change there", () => {
    const storage = memory();
    const events = new EventTarget();
    const here = createShortlistStore(storage, clock(), events);
    here.subscribe(() => {});
    here.add(card("a"));
    createShortlistStore(storage, clock(2000)).add(card("b"));
    events.dispatchEvent(new StorageEvent("storage", { key: SHORTLIST_KEY, newValue: storage.store.get(SHORTLIST_KEY) }));
    expect(here.clears()).toBe(0);
    createShortlistStore(storage, clock(3000)).clear();
    events.dispatchEvent(new StorageEvent("storage", { key: SHORTLIST_KEY, newValue: null }));
    expect(here.get()).toEqual([]);
    expect(here.clears()).toBe(1);
    // Another tab clearing all of the site's storage clears the list too.
    here.add(card("c"));
    storage.store.clear();
    events.dispatchEvent(new StorageEvent("storage", { key: null }));
    expect(here.get()).toEqual([]);
    expect(here.clears()).toBe(2);
  });

  it("keeps what this tab wrote after another tab's clear, but before it heard of it", () => {
    const storage = memory();
    const events = new EventTarget();
    const here = createShortlistStore(storage, clock(), events);
    here.subscribe(() => {});
    here.add(card("a"));
    createShortlistStore(storage, clock(3000)).clear();
    here.add(card("b"));
    events.dispatchEvent(new StorageEvent("storage", { key: SHORTLIST_KEY, newValue: null }));
    expect(here.get().map((e) => e.card.slug)).toEqual(["b"]);
    expect(here.clears()).toBe(1);
  });

  it("changes nothing for a therapist who isn't shortlisted", () => {
    const store = createShortlistStore(memory(), clock());
    store.setStatus("a", "contacted");
    store.setNote("a", "Rang on Tuesday");
    expect(store.get()).toEqual([]);
  });

  it("reads a status it doesn't know as To contact", () => {
    const entry = (status: unknown) => ({ addedAt: 1, status, card: { slug: "x", name: "X", initials: "X", tags: [] } });
    const read = (status: unknown) => createShortlistStore(memory({ v: 1, entries: { x: entry(status) } })).get()[0]?.status;
    expect(read("waiting")).toBe("waiting");
    expect(read("toContact")).toBeUndefined();
    expect(read("ghosted")).toBeUndefined();
    expect(read(3)).toBeUndefined();
  });

  it("follows a status changed in another tab", () => {
    const storage = memory();
    const events = new EventTarget();
    const store = createShortlistStore(storage, clock(), events);
    store.add(card("a"));
    store.subscribe(() => {});
    createShortlistStore(storage).setStatus("a", "waiting");
    events.dispatchEvent(new StorageEvent("storage", { key: SHORTLIST_KEY, newValue: storage.store.get(SHORTLIST_KEY) }));
    expect(statusOf(store.get()[0]!)).toBe("waiting");
  });

  it("keeps a note with the therapist, and for the next visit", () => {
    const storage = memory();
    const store = createShortlistStore(storage, clock());
    store.add(card("a"));
    expect(store.get()[0]?.note).toBeUndefined();
    store.setNote("a", "Rang on Tuesday\nCall back Friday");
    expect(store.get()[0]?.note).toBe("Rang on Tuesday\nCall back Friday");
    expect(createShortlistStore(storage).get()[0]?.note).toBe("Rang on Tuesday\nCall back Friday");
  });

  it("keeps an emptied note as none", () => {
    const storage = memory();
    const store = createShortlistStore(storage, clock());
    store.add(card("a"));
    store.setNote("a", "Rang on Tuesday");
    store.setNote("a", "");
    expect(store.get()[0]?.note).toBeUndefined();
    expect(JSON.parse(storage.store.get(SHORTLIST_KEY)!).entries.a).not.toHaveProperty("note");
  });

  it("holds a note to its limit, as written here or as stored", () => {
    const store = createShortlistStore(memory(), clock());
    store.add(card("a"));
    store.setNote("a", "x".repeat(NOTE_LIMIT + 1));
    expect(store.get()[0]?.note).toHaveLength(NOTE_LIMIT);
    const long = { addedAt: 1, note: "y".repeat(NOTE_LIMIT + 200), card: { slug: "x", name: "X", initials: "X", tags: [] } };
    expect(createShortlistStore(memory({ v: 1, entries: { x: long } })).get()[0]?.note).toHaveLength(NOTE_LIMIT);
  });

  it("reads a note that isn't a string, or is empty, as none", () => {
    const entry = (note: unknown) => ({ addedAt: 1, note, card: { slug: "x", name: "X", initials: "X", tags: [] } });
    const read = (note: unknown) => createShortlistStore(memory({ v: 1, entries: { x: entry(note) } })).get()[0];
    expect(read("Rang on Tuesday")?.note).toBe("Rang on Tuesday");
    expect(read(3)?.note).toBeUndefined();
    expect(read(["Rang"])?.note).toBeUndefined();
    expect(read("")?.note).toBeUndefined();
    // The entry itself still reads.
    expect(read(3)?.card.slug).toBe("x");
  });

  it("keeps a therapist's note as their status changes, they move, and fresh results update their card", () => {
    const store = createShortlistStore(memory(), clock());
    store.add(card("a"));
    store.add(card("b"));
    store.setNote("a", "Rang on Tuesday");
    store.setStatus("a", "contacted");
    store.move("a", { below: store.get()[0] });
    store.refresh([card("a", { name: "New name" })]);
    const a = store.get().find((e) => e.card.slug === "a");
    expect(a?.note).toBe("Rang on Tuesday");
    expect(a?.card.name).toBe("New name");
  });

  it("puts a therapist back with the note they had", () => {
    const store = createShortlistStore(memory(), clock());
    store.add(card("a"));
    store.setStatus("a", "waiting");
    store.setNote("a", "Rang on Tuesday");
    const [before] = store.get();
    store.remove("a");
    expect(store.get()).toEqual([]);
    store.add(before!.card, before);
    expect(store.get()).toEqual([before]);
  });

  it("follows a note changed in another tab", () => {
    const storage = memory();
    const events = new EventTarget();
    const store = createShortlistStore(storage, clock(), events);
    store.add(card("a"));
    store.subscribe(() => {});
    createShortlistStore(storage).setNote("a", "Booked for Monday");
    events.dispatchEvent(new StorageEvent("storage", { key: SHORTLIST_KEY, newValue: storage.store.get(SHORTLIST_KEY) }));
    expect(store.get()[0]?.note).toBe("Booked for Monday");
  });

  it("keeps a therapist removed, to put back where and as they were with the card it had, after a reload too", () => {
    const storage = memory();
    const store = createShortlistStore(storage, clock());
    for (const slug of ["a", "b", "c"]) store.add(card(slug));
    store.move("c", { above: store.get()[2] });
    store.setStatus("b", "consultation");
    store.setNote("b", "Rang on Tuesday");
    const before = store.get();
    store.remove("b");
    expect(store.has("b")).toBe(false);
    expect(store.removedCount()).toBe(1);
    const reloaded = createShortlistStore(storage, clock(5000));
    expect(reloaded.removedCount()).toBe(1);
    reloaded.add(card("b", { name: "Name from a thinner card" }));
    expect(reloaded.get()).toEqual(before);
    expect(reloaded.removedCount()).toBe(0);
  });

  it("puts a removed therapist back with the status given, in their place and with their note", () => {
    const store = createShortlistStore(memory(), clock());
    store.add(card("a"));
    store.add(card("b"));
    store.setStatus("a", "waiting");
    store.setNote("a", "Rang on Tuesday");
    store.remove("a");
    store.add(card("a"), { status: "contacted" });
    expect(store.get().map((e) => [e.card.slug, e.status, e.note])).toEqual([
      ["b", undefined, undefined],
      ["a", "contacted", "Rang on Tuesday"],
    ]);
  });

  it("says where an add leaves the therapist", () => {
    const store = createShortlistStore(memory(), clock());
    expect(store.add(card("a"))).toBe("toContact");
    store.setStatus("a", "waiting");
    store.remove("a");
    expect(store.add(card("a"))).toBe("waiting");
    store.remove("a");
    expect(store.add(card("a"), { status: "contacted" })).toBe("contacted");
  });

  it("keeps a note saved after its therapist was removed, for when they are added back", () => {
    const store = createShortlistStore(memory(), clock());
    store.add(card("a"));
    store.remove("a");
    store.setNote("a", "Rang on Tuesday");
    expect(store.get()).toEqual([]);
    store.add(card("a"));
    expect(store.get()[0]?.note).toBe("Rang on Tuesday");
  });

  it("follows a removal in another tab, to put the therapist back here as they were", () => {
    const storage = memory();
    const events = new EventTarget();
    const here = createShortlistStore(storage, clock(), events);
    here.subscribe(() => {});
    here.add(card("a"));
    here.setNote("a", "Rang on Tuesday");
    const before = here.get();
    createShortlistStore(storage, clock(5000)).remove("a");
    events.dispatchEvent(new StorageEvent("storage", { key: SHORTLIST_KEY, newValue: storage.store.get(SHORTLIST_KEY) }));
    expect(here.has("a")).toBe(false);
    expect(here.removedCount()).toBe(1);
    here.add(card("a"));
    expect(here.get()).toEqual(before);
  });

  it("leaves a therapist another tab added back as they are, though this tab had yet to hear of it", () => {
    const storage = memory();
    const there = createShortlistStore(storage, clock());
    there.add(card("a"));
    there.add(card("b"));
    there.setStatus("a", "consultation");
    there.setNote("a", "Rang on Tuesday");
    there.remove("a");
    // This tab loads with them removed, and hears nothing more.
    const here = createShortlistStore(storage, clock(5000));
    there.add(card("a"));
    const before = there.get();
    here.add(card("a"));
    expect(here.get()).toEqual(before);
    here.add(card("a"), { status: "contacted" });
    expect(here.get().map((e) => [e.card.slug, e.status, e.note])).toEqual([
      ["b", undefined, undefined],
      ["a", "contacted", "Rang on Tuesday"],
    ]);
  });

  it("forgets those removed 30 days or more before the page loads, in storage as well as on the page", () => {
    const day = 24 * 60 * 60 * 1000;
    const storage = memory();
    let t = 0;
    const earlier = createShortlistStore(storage, () => t);
    earlier.add(card("a"));
    earlier.add(card("b"));
    earlier.setNote("a", "Rang on Tuesday");
    earlier.remove("a");
    t = 5 * day;
    earlier.remove("b");
    t = REMOVED_DAYS * day - 1;
    expect(createShortlistStore(storage, () => t).removedCount()).toBe(2);
    t += 1;
    const later = createShortlistStore(storage, () => t);
    expect(later.removedCount()).toBe(1);
    expect(Object.keys(JSON.parse(storage.store.get(SHORTLIST_KEY)!).removed)).toEqual(["b"]);
    later.add(card("a"));
    expect(later.get()[0]).toEqual({ addedAt: t, card: { ...card("a"), distance: undefined } });
  });

  it("forgets those removed as it clears, here or in another tab", () => {
    const storage = memory();
    const events = new EventTarget();
    const store = createShortlistStore(storage, clock(), events);
    store.subscribe(() => {});
    store.add(card("a"));
    store.setNote("a", "Rang on Tuesday");
    store.remove("a");
    store.clear();
    expect(store.removedCount()).toBe(0);
    expect(storage.store.has(SHORTLIST_KEY)).toBe(false);
    store.add(card("a"));
    expect(store.get()[0]?.note).toBeUndefined();
    store.remove("a");
    createShortlistStore(storage).clear();
    events.dispatchEvent(new StorageEvent("storage", { key: SHORTLIST_KEY, newValue: null }));
    expect(store.removedCount()).toBe(0);
  });

  it("reads those removed beside the list, dropping any it can't read or that are listed too", () => {
    const entry = (slug: string, extra = {}) => ({ addedAt: 1, card: { slug, name: slug, initials: "X", tags: [] }, ...extra });
    // Only "b" reads: "a" is listed, "c" has no time of removal, "d" no card and "e" another's slug.
    const removed = {
      a: entry("a", { removedAt: 2 }),
      b: entry("b", { removedAt: 2 }),
      c: entry("c"),
      d: { removedAt: 2 },
      e: entry("x", { removedAt: 2 }),
    };
    expect(createShortlistStore(memory({ v: 1, entries: { a: entry("a") }, removed }), () => 3).removedCount()).toBe(1);
    expect(createShortlistStore(memory({ v: 1, entries: {}, removed: "b" })).removedCount()).toBe(0);
    // As a release before removed therapists were kept wrote it.
    expect(createShortlistStore(memory({ v: 1, entries: { a: entry("a") } })).removedCount()).toBe(0);
  });

  it("catches up with those another tab forgot while no one here was subscribed", () => {
    const storage = memory();
    const store = createShortlistStore(storage, clock(), new EventTarget());
    store.add(card("a"));
    store.remove("a");
    expect(store.removedCount()).toBe(1);
    // Another tab, loaded long after, forgets them.
    createShortlistStore(storage, () => 1001 + REMOVED_DAYS * 24 * 60 * 60 * 1000);
    store.subscribe(() => {});
    expect(store.removedCount()).toBe(0);
  });

  it("keeps the search a therapist was found by, their draft and the visitor's own fields, for the next visit", () => {
    const storage = memory();
    const store = createShortlistStore(storage, clock());
    store.add(card("a"), { search: "HelpWithAdvanced=Anxiety&Location=Leeds" });
    store.setDraft("a", { subject: "Hello", message: "Dear A" });
    store.setSender({ name: "Sam", free: "weekday evenings" });
    const again = createShortlistStore(storage, clock());
    expect(again.get()[0]).toMatchObject({ search: "HelpWithAdvanced=Anxiety&Location=Leeds", draft: { subject: "Hello", message: "Dear A" } });
    expect(again.sender()).toEqual({ name: "Sam", free: "weekday evenings" });
  });

  it("takes the newer search on adding a therapist back, keeping the one they had where none is given, and keeps their draft", () => {
    const store = createShortlistStore(memory(), clock());
    store.add(card("a"), { search: "Location=Leeds" });
    store.setDraft("a", { subject: "S", message: "M" });
    store.remove("a");
    store.add(card("a"), { search: undefined });
    expect(store.get()[0]).toMatchObject({ search: "Location=Leeds", draft: { subject: "S", message: "M" } });
    store.remove("a");
    store.add(card("a"), { search: "Location=York" });
    expect(store.get()[0]?.search).toBe("Location=York");
  });

  it("keeps a found-by search up to its limit, and none longer or empty", () => {
    const store = createShortlistStore(memory(), clock());
    store.add(card("a"), { search: "x".repeat(SEARCH_LIMIT) });
    store.add(card("b"), { search: "x".repeat(SEARCH_LIMIT + 1) });
    store.add(card("c"), { search: "" });
    const searchOf = (slug: string) => store.get().find((entry) => entry.card.slug === slug)?.search;
    expect(searchOf("a")).toBe("x".repeat(SEARCH_LIMIT));
    expect(searchOf("b")).toBeUndefined();
    expect(searchOf("c")).toBeUndefined();
  });

  it("keeps a draft saved after its therapist was removed, for when they are added back", () => {
    const store = createShortlistStore(memory(), clock());
    store.add(card("a"));
    store.remove("a");
    store.setDraft("a", { subject: "S", message: "M" });
    store.add(card("a"));
    expect(store.get()[0]?.draft).toEqual({ subject: "S", message: "M" });
  });

  it("holds a draft and the visitor's fields to their limits, and forgets a draft or fields set to none", () => {
    const store = createShortlistStore(memory(), clock());
    store.add(card("a"));
    store.setDraft("a", { subject: "x".repeat(SUBJECT_LIMIT + 1), message: "y".repeat(MESSAGE_LIMIT + 1) });
    expect(store.get()[0]?.draft).toEqual({ subject: "x".repeat(SUBJECT_LIMIT), message: "y".repeat(MESSAGE_LIMIT) });
    store.setDraft("a", undefined);
    expect(store.get()[0]?.draft).toBeUndefined();
    store.setSender({ name: "n".repeat(SENDER_LIMIT + 1), free: "" });
    expect(store.sender()).toEqual({ name: "n".repeat(SENDER_LIMIT) });
    store.setSender({ name: "", free: "" });
    expect(store.sender()).toBeUndefined();
  });

  it("drops a stored search, draft or sender it can't read", () => {
    const stored = { v: 1, entries: { a: { addedAt: 1, search: 7, draft: { subject: 1 }, card: card("a") } }, removed: {}, sender: "Sam" };
    const store = createShortlistStore(memory(stored));
    expect(store.get()[0]).toEqual({ addedAt: 1, card: { ...card("a"), distance: undefined } });
    expect(store.sender()).toBeUndefined();
  });

  it("clears drafts and the visitor's own fields with the list", () => {
    const storage = memory();
    const store = createShortlistStore(storage, clock());
    store.add(card("a"));
    store.setDraft("a", { subject: "S", message: "M" });
    store.setSender({ name: "Sam" });
    store.clear();
    expect(store.sender()).toBeUndefined();
    expect(createShortlistStore(storage).sender()).toBeUndefined();
  });

  it("keeps the visitor's own fields as other changes are made, and follows them changed in another tab", () => {
    const storage = memory();
    const events = new EventTarget();
    const store = createShortlistStore(storage, clock(), events);
    store.setSender({ name: "Sam" });
    store.add(card("a"));
    expect(store.sender()).toEqual({ name: "Sam" });
    store.subscribe(() => {});
    createShortlistStore(storage).setSender({ name: "Sam", free: "mornings" });
    events.dispatchEvent(new StorageEvent("storage", { key: SHORTLIST_KEY, newValue: storage.store.get(SHORTLIST_KEY) }));
    expect(store.sender()).toEqual({ name: "Sam", free: "mornings" });
  });

  it("keeps the visitor's fields as another tab set them when this tab changes the list before hearing of it", () => {
    const storage = memory();
    const store = createShortlistStore(storage, clock());
    createShortlistStore(storage).setSender({ name: "Sam", free: "mornings" });
    store.add(card("a"));
    expect(createShortlistStore(storage).sender()).toEqual({ name: "Sam", free: "mornings" });
    expect(store.sender()).toEqual({ name: "Sam", free: "mornings" });
  });
});
