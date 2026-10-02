import { ukcpProfileUrl } from "@shared/query";
import { STATUS_LABEL } from "./status";
import { statusOf, type Shortlist, type ShortlistEntry } from "./store";

/**
 * The shortlist as plain text, to paste into an email or a note for someone helping the visitor choose: those still in mind
 * numbered in the visitor's order, each with where the visitor stands, then those set aside. Each gives UKCP's page for the
 * therapist, which outlasts this site's links, and the visitor's notes on them, which go with the list when it is cleared.
 */
export function shortlistText(shortlist: Shortlist, on: Date): string {
  const date = on.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
  const inMind = shortlist.filter((entry) => statusOf(entry) !== "setAside");
  const setAside = shortlist.filter((entry) => statusOf(entry) === "setAside");
  const blocks = [
    `My shortlist of UKCP therapists, ${date}`,
    ...inMind.map((entry, i) => entryText(entry, `${i + 1}. ${entry.card.name}: ${STATUS_LABEL[statusOf(entry)]}`)),
  ];
  if (setAside.length > 0) blocks.push(STATUS_LABEL.setAside, ...setAside.map((entry) => entryText(entry, entry.card.name)));
  return `${blocks.join("\n\n")}\n`;
}

function entryText({ card, note }: ShortlistEntry, first: string): string {
  const where = [card.location, card.sessionTypes].filter(Boolean).join(" · ");
  // The visitor's lines, less blank ones, which would part the note from its therapist.
  const notes = note?.trim().replace(/\n\s*\n/g, "\n");
  return [first, where, ukcpProfileUrl(card.slug), notes && `My notes: ${notes}`].filter(Boolean).join("\n");
}
