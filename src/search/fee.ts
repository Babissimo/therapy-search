/** Whom a fee is for, as an office says it and as the Works With filter asks. */
export type FeeKind = "individual" | "couple" | "family" | "group" | "child";

/** A card's line on fees: what the office charges, or that it gives no amount; `given` when the text is the fees themselves. */
export type Fee = { text: string; given: boolean };

type Label = FeeKind | "other";
type Price = { low: number; high: number; from: boolean; labels: Label[] };
type Found = { index: number; end: number };

const WORKS_WITH: Record<string, FeeKind> = {
  Individuals: "individual",
  Couples: "couple",
  Families: "family",
  Groups: "group",
  "Children and young people": "child",
};
const KINDS: FeeKind[] = ["individual", "couple", "family", "group", "child"];
// A card says these unless the search asks for other kinds.
const USUAL: FeeKind[] = ["individual", "couple"];
// As in "individual therapy", "couples therapy", "family therapy".
const ADJECTIVE: Record<FeeKind, string> = { individual: "individual", couple: "couples", family: "family", group: "group", child: "child" };
const NOUN: Record<FeeKind, string> = { individual: "individuals", couple: "couples", family: "families", group: "groups", child: "children" };

// "Other" is a service beside therapy (supervision, an assessment, a consultation) or one an organisation pays for, whose
// price a card leaves out.
const LABELS: [Label, RegExp][] = [
  ["individual", /\b(?:individuals?|one[- ]to[- ]one|adults?)\b/gi],
  ["couple", /\bcouples?\b/gi],
  ["family", /\bfamil(?:y|ies)\b/gi],
  ["group", /\bgroups?\b/gi],
  ["child", /\b(?:child(?:ren)?|young (?:people|person)|adolescents?|teen(?:ager)?s?)\b/gi],
  [
    "other",
    /\b(?:supervis\w*|assessments?|consultations?|initial|introductory|first session|coaching|reports?|workshops?|courses?|training|cancell?ations?|missed|schools?|compan(?:y|ies)|organi[sz]ations?|employers?|corporate)\b/gi,
  ],
];
// "A free initial consultation" names no paid service, so its words label no amount.
const FREE = /\bfree\b[^.;,\n£]*/gi;

const POUNDS = String.raw`(\d{1,3}(?:,\d{3})+(?:\.\d{1,2})?|\d+(?:\.\d{1,2})?)`;
const DASH = String.raw`\s*(?:-|–|—|to)\s*`;
// A number followed by a length, as in "£60 - 90 minutes", ends no range.
const NOT_LENGTH = String.raw`(?!\d)(?!\s*(?:min|hour|hr))`;
// "£60", "£60 -70", "£60–£100", "£60 to £70"; "GBP 60"; "60 pounds".
const STERLING = new RegExp(
  String.raw`(?:£|\bGBP)\s*${POUNDS}(?:${DASH}£?\s*${POUNDS}${NOT_LENGTH})?|\b${POUNDS}(?:${DASH}${POUNDS})?\s*(?:pounds?|GBP)\b`,
  "gi",
);
// Under "Cost:", a number with no currency anywhere, "60" or "80 to 200", is pounds, unless it is a time or an age or
// counts something else.
const BARE = new RegExp(
  String.raw`(?<![\d.,/]|\d:|\b(?:over|under|aged?)\s)\b(\d{2,3})(?:${DASH}(\d{2,3}))?\b(?![.,:/]?\d)` +
    String.raw`(?!\s*(?:-\s*)?(?:min|hour|hr|session|week|month|year|day|%|am\b|pm\b|noon|midnight|o'?clock|th\b|st\b|nd\b|rd\b|people|clients|x\b|\+|and (?:over|under|above)))`,
  "gi",
);
// Any currency at all, as an office abroad may charge in euros or dollars, which a card leaves in the office's own words.
const CURRENCY = /[£€$]|\b(?:GBP|EUR|USD|pounds?|euros?|dollars?)\b/i;
const FROM = /\b(?:from|starting at)\s*$/i;
// A line naming whom the lines after it are for, as "Individual sessions:" or "Couples", is no longer than this.
const HEADING_WORDS = 5;
// The office's own words go on the card where they name no amount, if no longer than this.
const WORDS_LENGTH = 40;
const ON_PROFILE: Fee = { text: "Fees on their profile", given: false };

/** The kinds of fee a search's Works With ticks ask for. */
export function feeKinds(worksWith: readonly string[]): FeeKind[] {
  return KINDS.filter((kind) => worksWith.some((value) => WORKS_WITH[value] === kind));
}

/**
 * What a card says of an office's fees, from the text under its "Cost:" heading: the fee for each kind of session the
 * search asks for, or individual and couple sessions' where it asks for none, and the office's own words where it names
 * no amount.
 */
export function feeLine(cost: string | undefined, wanted: readonly FeeKind[] = []): Fee {
  if (!cost?.trim()) return { text: "No fees given", given: false };
  const all = pricesIn(cost);
  const prices = all.filter((p) => !p.labels.includes("other"));
  const plain = prices.filter((p) => p.labels.length === 0);
  const of = (kind: FeeKind) => prices.filter((p) => p.labels.includes(kind));
  // A fee naming no one is for everyone where the office names no one, and otherwise stands in for an individual fee it
  // doesn't name, as in "£80 per session, £110 for couples". Unnamed, as it may be neither.
  const partOf = (kind: FeeKind): [FeeKind[], Price[]] | undefined =>
    of(kind).length > 0 ? [[kind], of(kind)] : kind === "individual" && plain.length > 0 ? [[], plain] : undefined;
  const partsOf = (kinds: readonly FeeKind[]) => kinds.map(partOf).filter((part) => part !== undefined);
  const parts: [FeeKind[], Price[]][] = [];
  if (wanted.length > 0) {
    parts.push(...partsOf(wanted));
    if (parts.length === 0 && plain.length === prices.length && plain.length > 0) parts.push([[], plain]);
    if (parts.length === 0 && prices.length > 0) return { text: `No fee given for ${list(wanted.map((k) => NOUN[k]), "or")}`, given: false };
  } else {
    parts.push(...partsOf(USUAL));
    if (parts.length === 0) parts.push(...partsOf(KINDS));
  }
  if (parts.length === 0) return all.length > 0 ? ON_PROFILE : wordsOf(cost);
  // Kinds charged the same share one amount: "Couples and family £100".
  const merged: [FeeKind[], string][] = [];
  for (const [kinds, ps] of parts) {
    const amount = amountOf(ps);
    const last = merged.at(-1);
    if (last && last[0].length > 0 && kinds.length > 0 && last[1] === amount) last[0].push(...kinds);
    else merged.push([[...kinds], amount]);
  }
  const text = merged.map(([kinds, amount]) => (kinds.length > 0 ? `${list(kinds.map((k) => ADJECTIVE[k]), "and")} ${amount}` : amount)).join(", ");
  return { text: text.charAt(0).toUpperCase() + text.slice(1), given: true };
}

/** The office's own words where they name no amount, when short enough for a card's line. */
function wordsOf(cost: string): Fee {
  const words = cost.trim();
  return !words.includes("\n") && words.length <= WORDS_LENGTH ? { text: words, given: true } : ON_PROFILE;
}

function amountOf(prices: Price[]): string {
  const low = Math.min(...prices.map((p) => p.low));
  const high = Math.max(...prices.map((p) => p.high));
  if (high > low) return `${pounds(low)}–${pounds(high)}`;
  return prices.some((p) => p.from) ? `from ${pounds(low)}` : pounds(low);
}

function pounds(amount: number): string {
  return `£${amount.toLocaleString("en-GB", { minimumFractionDigits: Number.isInteger(amount) ? 0 : 2, maximumFractionDigits: 2 })}`;
}

function list(words: string[], joiner: "and" | "or"): string {
  return words.length < 2 ? (words[0] ?? "") : `${words.slice(0, -1).join(", ")} ${joiner} ${words.at(-1)}`;
}

/**
 * Each amount the text gives, with whom it is for. A line or sentence naming someone before its first amount
 * ("Couples: £90") names them for the amounts after it; one starting with an amount ("£90 for couples") names them after
 * each. A short line naming someone and no amount heads the lines below it.
 */
function pricesIn(cost: string): Price[] {
  const bare = !CURRENCY.test(cost);
  const prices: Price[] = [];
  let heading: Label[] = [];
  for (const line of cost.split("\n")) {
    const found = line.split(/;|\.(?=\s|$)/).flatMap((clause) => clausePrices(clause, bare));
    if (found.length === 0) {
      const labels = unique(labelsIn(line).map((l) => l.label));
      const short = line.trim().split(/\s+/).length <= HEADING_WORDS || line.trim().endsWith(":");
      if (labels.length > 0 && short) heading = labels;
    } else {
      prices.push(...found.map((p) => (p.labels.length > 0 ? p : { ...p, labels: heading })));
    }
  }
  return prices;
}

function clausePrices(clause: string, bare: boolean): Price[] {
  const amounts = amountsIn(clause, bare);
  if (amounts.length === 0) return [];
  const labels = labelsIn(clause);
  const labelFirst = labels.length > 0 && labels[0]!.index < amounts[0]!.index;
  let carried: Label[] = [];
  return amounts.map((amount, i) => {
    const [start, end] = labelFirst ? [amounts[i - 1]?.end ?? 0, amount.index] : [amount.end, amounts[i + 1]?.index ?? clause.length];
    const named = unique(labels.filter((l) => l.index >= start && l.index < end).map((l) => l.label));
    let own = named;
    if (labelFirst) {
      // A service beside therapy hands on no label: in "Assessment £120, then £80", the £80 is therapy's.
      if (named.length > 0) carried = named.includes("other") ? [] : named;
      else own = carried;
    }
    return { ...amount, labels: own, from: FROM.test(clause.slice(0, amount.index)) };
  });
}

function amountsIn(text: string, bare: boolean): (Found & Pick<Price, "low" | "high">)[] {
  return [...text.matchAll(bare ? BARE : STERLING)].flatMap((match) => {
    const [low, high] = match
      .slice(1)
      .filter((group) => group !== undefined)
      .map((group) => Number(group.replaceAll(",", "")));
    if (low === undefined) return [];
    // A smaller number after a dash is something else, such as the length in "£70 - 50 minutes".
    return [{ index: match.index, end: match.index + match[0].length, low, high: high !== undefined && high > low ? high : low }];
  });
}

function labelsIn(text: string): (Found & { label: Label })[] {
  const paid = text.replace(FREE, (free) => " ".repeat(free.length));
  return LABELS.flatMap(([label, pattern]) => [...paid.matchAll(pattern)].map((m) => ({ label, index: m.index, end: m.index + m[0].length }))).sort(
    (a, b) => a.index - b.index,
  );
}

function unique<T>(items: T[]): T[] {
  return [...new Set(items)];
}
