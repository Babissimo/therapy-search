import { describe, expect, it } from "vitest";
import { shortlistText } from "./asText";
import { createShortlistStore, type ShortlistCard, type Status } from "./store";

const card = (slug: string, name: string, more: Partial<ShortlistCard> = {}): ShortlistCard => ({
  slug,
  name,
  initials: "XX",
  location: "Leeds LS1",
  sessionTypes: "In-person & Remote",
  summary: `About ${name}.`,
  tags: [],
  ...more,
});

/** A shortlist of `cards`, each newer than the last, with `statuses` by slug. */
function shortlist(statuses: Record<string, Status>, ...cards: ShortlistCard[]) {
  let t = 1000;
  const store = createShortlistStore(null, () => t++);
  for (const c of cards) store.add(c);
  for (const [slug, status] of Object.entries(statuses)) store.setStatus(slug, status);
  return store.get();
}

const ON = new Date(2026, 9, 2, 10, 30);

describe("shortlistText", () => {
  it("numbers those still in mind in the visitor's order, each with where the visitor stands, place and UKCP page, then those set aside", () => {
    const list = shortlist(
      { "Ann-AAAAAAAA": "contacted", "Bo-BBBBBBBB": "setAside" },
      card("Ann-AAAAAAAA", "Ann Ash"),
      card("Bo-BBBBBBBB", "Bo Birch", { location: "Bath BA1", sessionTypes: "Remote" }),
      card("Cy-CCCCCCCC", "Cy Cedar"),
    );
    expect(shortlistText(list, ON)).toBe(
      [
        "My shortlist of UKCP therapists, 2 October 2026",
        "",
        "1. Cy Cedar: To contact",
        "Leeds LS1 · In-person & Remote",
        "https://www.psychotherapy.org.uk/therapist/Cy-CCCCCCCC",
        "",
        "2. Ann Ash: Contacted",
        "Leeds LS1 · In-person & Remote",
        "https://www.psychotherapy.org.uk/therapist/Ann-AAAAAAAA",
        "",
        "Set aside",
        "",
        "Bo Birch",
        "Bath BA1 · Remote",
        "https://www.psychotherapy.org.uk/therapist/Bo-BBBBBBBB",
        "",
      ].join("\n"),
    );
  });

  it("gives the visitor's notes under each therapist, their lines kept but not the blank ones between", () => {
    let t = 1000;
    const store = createShortlistStore(null, () => t++);
    store.add(card("Ann-AAAAAAAA", "Ann Ash"));
    store.add(card("Bo-BBBBBBBB", "Bo Birch"));
    store.setNote("Ann-AAAAAAAA", "  Rang Tuesday.\n\n\nCall back Friday, £60 a session.\n");
    store.setNote("Bo-BBBBBBBB", " \n ");
    expect(shortlistText(store.get(), ON).split("\n\n")).toEqual([
      "My shortlist of UKCP therapists, 2 October 2026",
      "1. Bo Birch: To contact\nLeeds LS1 · In-person & Remote\nhttps://www.psychotherapy.org.uk/therapist/Bo-BBBBBBBB",
      "2. Ann Ash: To contact\nLeeds LS1 · In-person & Remote\nhttps://www.psychotherapy.org.uk/therapist/Ann-AAAAAAAA\n" +
        "My notes: Rang Tuesday.\nCall back Friday, £60 a session.\n",
    ]);
  });

  it("leaves out what a card doesn't say, and the heading for those set aside where there are none", () => {
    const list = shortlist(
      {},
      card("Ann-AAAAAAAA", "Ann Ash", { location: undefined, sessionTypes: undefined }),
      card("Bo-BBBBBBBB", "Bo Birch", { sessionTypes: undefined }),
    );
    expect(shortlistText(list, ON).split("\n\n")).toEqual([
      "My shortlist of UKCP therapists, 2 October 2026",
      "1. Bo Birch: To contact\nLeeds LS1\nhttps://www.psychotherapy.org.uk/therapist/Bo-BBBBBBBB",
      "2. Ann Ash: To contact\nhttps://www.psychotherapy.org.uk/therapist/Ann-AAAAAAAA\n",
    ]);
  });
});
