import { OPTIONS } from "@shared/options";
import type { SearchParams } from "@shared/query";
import type { Profile } from "@shared/types";
import { SESSIONS_HEADING } from "@/profile/sessions";
import { helpWithTerms } from "@/search/state";

/** Which part of the message a mention goes in, in the order the message says them. */
const TOPICS = ["who", "help", "approach", "type", "how", "language", "place", "access", "insurance"] as const;
export type Topic = (typeof TOPICS)[number];

type Term = "longer-term" | "short-term";

/**
 * One thing from the search the message can say, which the visitor ticks or unticks as a chip. `label` names the chip and
 * `words` are what the message says; meeting in person may carry the term of the work sought.
 */
export type Mention = { key: string; topic: Topic; label: string; words: string; term?: Term };

/** The mention whose words call for the help-now line beside the message. */
export const CRISIS_KEY = "help:suicidal thoughts";

/** The mention of seeking a therapist for a child, which makes the help sought the child's. */
export const CHILD_KEY = "who:Children and young people";

/** UKCP's labels in one of its filter lists, by their lower case. */
function labelsOf(name: string): Map<string, string> {
  const fields = OPTIONS.groups.flatMap((group) => group.fields).filter((field) => field.name === name);
  return new Map(fields.map((field) => [field.label.toLowerCase(), field.label]));
}
const HELP = labelsOf("HelpWithAdvanced");
const TYPES = labelsOf("TypesOfTherapy");

const WHO: Record<string, string> = {
  Individuals: "a therapist for myself",
  Couples: "couples therapy with my partner",
  Families: "family therapy",
  "Children and young people": "a therapist for my child",
  Groups: "group therapy",
};
const INSURANCE = "Private healthcare referrals";

/** Help-with terms that don't read after "help with", in words that do. */
const REWORDED: Record<string, string> = {
  Suicide: "suicidal thoughts",
  "Sex Offenders": "a risk of sexual offending",
  "Those at Risk of Sexual Offending": "a risk of sexual offending",
  "Those at Risk of Sexually Offending": "a risk of sexual offending",
  "Workplace Counselling": "problems at work",
  Parents: "parenting",
  Gender: "gender identity",
  Transgender: "gender identity",
  Family: "family issues",
  Supervision: "clinical supervision",
  Training: "my training as a therapist",
  "Private Practice Issues": "running a private practice",
};
/** Help-with terms that name a way of meeting, as the session type they mean. */
const AS_SESSION: Record<string, string> = { "Online Counselling": "Online Therapy", "Telephone Counselling": "Telephone Therapy" };
/** Help-with terms that name a way of working rather than a difficulty. */
const APPROACHES = new Set(["EMDR"]);

type Session = "inPerson" | "home" | "online" | "phone";
const SESSIONS: Record<string, { session: Session; term?: Term }> = {
  "Face to Face - Long Term": { session: "inPerson", term: "longer-term" },
  "Face to Face - Short Term": { session: "inPerson", term: "short-term" },
  "Home Visits": { session: "home" },
  "Online Therapy": { session: "online" },
  "Telephone Therapy": { session: "phone" },
};
/** In the order the message names them. */
const SESSION_WORDS: Record<Session, string> = { inPerson: "in person", home: "at home", online: "online", phone: "by phone" };

// UKCP's profile heading, compared without case.
const THERAPIES = "types of therapies offered";

/** A full postcode anywhere in a text, its outward code captured; the codes may be parted by a space, a hyphen or both. */
const POSTCODE = /\b([A-Z]{1,2}\d[A-Z\d]?)(?: ?- ?| )?\d[A-Z]{2}\b/i;
const OUTCODE = /^[A-Z]{1,2}\d[A-Z\d]?$/i;

/** Everything in a search that the message can mention, in the order it says them, narrowed to what the profile lists where it has one. */
export function mentionsOf(params: SearchParams, profile?: Profile): Mention[] {
  const mentions = new Map<string, Mention>();
  const add = (mention: Mention) => {
    if (!mentions.has(mention.key)) mentions.set(mention.key, mention);
  };
  const terms = helpWithTerms(params);

  for (const value of params.multi.WorksWith) {
    const words = WHO[value];
    if (words) add({ key: `who:${value}`, topic: "who", label: value, words });
  }

  const sessions = new Set(params.multi.TypesOfSession);
  const help = [...params.multi.HelpWithAdvanced, ...terms.flatMap((term) => HELP.get(term.toLowerCase()) ?? [])];
  for (const term of help) {
    const session = AS_SESSION[term];
    if (session) sessions.add(session);
    else if (APPROACHES.has(term)) add({ key: `approach:${term}`, topic: "approach", label: term, words: term });
    else {
      const reworded = REWORDED[term];
      const words = reworded ?? inSentence(term);
      add({ key: `help:${words}`, topic: "help", label: reworded ? capitalised(reworded) : term, words });
    }
  }

  const offered = itemsUnder(profile?.about, THERAPIES);
  const types = [...params.multi.TypesOfTherapy, ...terms.flatMap((term) => TYPES.get(term.toLowerCase()) ?? [])];
  for (const title of types) {
    if (!offered || offered.has(title.toLowerCase())) add({ key: `type:${title}`, topic: "type", label: title, words: withArticle(title) });
  }

  const offers = itemsUnder(profile?.practical, SESSIONS_HEADING);
  const kept = [...sessions].flatMap((value) => {
    const kind = SESSIONS[value];
    return kind && (!offers || offers.has(value.toLowerCase())) ? [kind] : [];
  });
  const inPersonTerms = new Set(kept.flatMap(({ term }) => term ?? []));
  const keptSessions = new Set(kept.map(({ session }) => session));
  for (const session of Object.keys(SESSION_WORDS) as Session[]) {
    if (!keptSessions.has(session)) continue;
    const term = session === "inPerson" && inPersonTerms.size === 1 ? [...inPersonTerms][0] : undefined;
    const words = SESSION_WORDS[session];
    add({ key: `how:${session}`, topic: "how", label: capitalised(words), words, term });
  }

  const spoken = profile?.languages.map((language) => singleSpaced(language).toLowerCase()) ?? [];
  const speaks = spoken.length > 0 ? new Set(spoken) : undefined;
  for (const searched of params.multi.Languages) {
    const language = singleSpaced(searched);
    if (!speaks || speaks.has(language.toLowerCase())) add({ key: `language:${language}`, topic: "language", label: language, words: language });
  }

  const location = singleSpaced(params.text.Location);
  if (location) add(placeOf(location));
  if (params.flags.OnlyWheelchairAccessible) {
    add({ key: "access", topic: "access", label: "Wheelchair access", words: "whether your room is wheelchair accessible" });
  }
  if (params.multi.WorksWith.includes(INSURANCE)) {
    add({
      key: "insurance",
      topic: "insurance",
      label: "Private health insurance",
      words: "whether you accept clients through private health insurance",
    });
  }
  return [...mentions.values()].sort((a, b) => TOPICS.indexOf(a.topic) - TOPICS.indexOf(b.topic));
}

/** A place as typed, or a postcode, wherever in it, by its outward code, which says roughly where without the street. */
function placeOf(location: string): Mention {
  const area = (POSTCODE.exec(location)?.[1] ?? (OUTCODE.test(location) ? location : undefined))?.toUpperCase();
  return area
    ? { key: "place", topic: "place", label: `In the ${area} area`, words: `in the ${area} area` }
    : { key: "place", topic: "place", label: `Near ${location}`, words: `near ${location}` };
}

/** The items a profile lists under a heading, by their lower case, or nothing where it lists none. */
function itemsUnder(sections: Profile["about"] | undefined, heading: string): Set<string> | undefined {
  const items = sections?.find((section) => section.heading.toLowerCase() === heading)?.items ?? [];
  return items.length > 0 ? new Set(items.map((item) => item.toLowerCase())) : undefined;
}

/** A term as it reads mid-sentence: lower case, but for words in capitals, such as ADHD. */
function inSentence(term: string): string {
  return term
    .split(" ")
    .map((word) => (word.length > 1 && word === word.toUpperCase() ? word : word.toLowerCase()))
    .join(" ");
}

/** "a" or "an" by how the title sounds: "an Integrative", but "a UTC". */
function withArticle(title: string): string {
  return `${/^[AEIO]|^U[a-z]/.test(title) ? "an" : "a"} ${title}`;
}

/** Text with each run of white space, a non-breaking space among it, as one plain space, and its zero-width characters gone. */
function singleSpaced(text: string): string {
  return text.replace(/[\u200b-\u200d\ufeff]/g, "").replace(/\s+/g, " ").trim();
}

function capitalised(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}
