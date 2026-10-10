import { ukcpProfileUrl } from "@shared/query";
import { STATUS_LABEL } from "./status";
import { statusOf, type Shortlist, type ShortlistEntry, type Status } from "./store";

/** The statuses given apart from the numbered list, each under its label, in the tab's order. */
const APART: readonly Status[] = ["maybe", "setAside"];

/**
 * The shortlist as plain text, to paste into an email or a note for someone helping the visitor choose: those still in mind
 * numbered in the visitor's order, each with where the visitor stands, then those the visitor is unsure of and those set aside,
 * each under its heading. Each gives UKCP's page for the therapist, which outlasts this site's links, and the visitor's notes
 * on them, which go with the list when it is cleared.
 */
export function shortlistText(shortlist: Shortlist, on: Date): string {
  const date = on.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
  const inMind = shortlist.filter((entry) => !APART.includes(statusOf(entry)));
  const blocks = [
    `My shortlist of UKCP therapists, ${date}`,
    ...inMind.map((entry, i) => entryText(entry, `${i + 1}. ${entry.card.name}: ${STATUS_LABEL[statusOf(entry)]}`)),
  ];
  for (const status of APART) {
    const apart = shortlist.filter((entry) => statusOf(entry) === status);
    if (apart.length > 0) blocks.push(STATUS_LABEL[status], ...apart.map((entry) => entryText(entry, entry.card.name)));
  }
  return `${blocks.join("\n\n")}\n`;
}

function entryText({ card, note }: ShortlistEntry, first: string): string {
  const where = [card.location, card.sessionTypes].filter(Boolean).join(" · ");
  // The visitor's lines, less blank ones, which would part the note from its therapist.
  const notes = note?.trim().replace(/\n\s*\n/g, "\n");
  return [first, where, ukcpProfileUrl(card.slug), notes && `My notes: ${notes}`].filter(Boolean).join("\n");
}
