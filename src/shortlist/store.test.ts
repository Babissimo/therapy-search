// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import type { TherapistCard } from "@shared/types";
import { createShortlistStore, SHORTLIST_KEY, statusOf } from "./store";

function memory(initial?: unknown) {
  const store = new Map<string, string>(initial === undefined ? [] : [[SHORTLIST_KEY, typeof initial === "string" ? initial : JSON.stringify(initial)]]);
  return {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
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

  it("follows changes made in another tab", () => {
    const storage = memory();
    const events = new EventTarget();
    const store = createShortlistStore(storage, clock(), events);
    const onChange = vi.fn();
    store.subscribe(onChange);
    createShortlistStore(storage, clock(5000)).add(card("elsewhere"));
    events.dispatchEvent(new StorageEvent("storage", { key: "theme" }));
    expect(onChange).not.toHaveBeenCalled();
    events.dispatchEvent(new StorageEvent("storage", { key: SHORTLIST_KEY }));
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
    expect(store.get()[0]).toEqual({ addedAt: 1001, status: "contacted", card: { ...card("b"), distance: undefined } });
  });

  it("changes nothing for a therapist who isn't shortlisted", () => {
    const store = createShortlistStore(memory(), clock());
    store.setStatus("a", "contacted");
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
    events.dispatchEvent(new StorageEvent("storage", { key: SHORTLIST_KEY }));
    expect(statusOf(store.get()[0]!)).toBe("waiting");
  });
});
