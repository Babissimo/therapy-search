import type { Profile } from "@shared/types";
import type { EmailDraft, Sender } from "@/shortlist/store";
import { CHILD_KEY, CRISIS_KEY, type Mention, type Topic } from "./mentions";

export const SUBJECT = "Enquiry about therapy";

/** An email as the site writes it, and whether what it says calls for the help-now line. */
export type Written = EmailDraft & { crisis: boolean };

type Source = {
  /** The therapist's name as UKCP gives it. */
  therapist: string;
  mentions: readonly Mention[];
  /** Keys of the mentions the visitor unticked. */
  unticked: ReadonlySet<string>;
  asksFee: boolean;
  sender: Sender;
};

/** Words that open a name as a title, compared without case. */
const TITLES = /^(dr|prof|professor|mr|mrs|ms|miss|mx|rev|revd)$/i;

/** The name to greet: the first word of the name, or a name that opens with a title by that title and the last word ("Dr Bloggs"). */
export function firstName(name: string): string {
  const [first = name, ...rest] = name.trim().split(/\s+/);
  const title = first.replace(/\.$/, "");
  const last = rest.at(-1);
  return last && TITLES.test(title) ? `${title} ${last}` : first;
}

/** Whether to ask the fee: only where no office on the profile shows one, or there is no profile to say. */
export function asksFee(profile?: Profile): boolean {
  return !profile?.offices.some((office) => office.cost);
}

/** A first email to a therapist from what the visitor left ticked and gave of themselves; a part with nothing to say is left out whole. */
export function writeEmail({ therapist, mentions, unticked, asksFee: fee, sender }: Source): Written {
  const ticked = mentions.filter((mention) => !unticked.has(mention.key));
  const of = (topic: Topic) => ticked.filter((mention) => mention.topic === topic);
  const words = (topic: Topic) => of(topic).map((mention) => mention.words);

  const who = of("who");
  const forChild = who.length > 0 && who.every((mention) => mention.key === CHILD_KEY);
  const about = [`I found your profile on the UKCP register and I'm looking for ${and(words("who")) || "a therapist"}.`];
  const help = words("help");
  if (help.length > 0) about.push(`I'd like some help ${forChild ? "for my child " : ""}with ${and(help)}.`);
  const types = words("type");
  const interests = [...words("approach"), ...(types.length > 0 ? [`working with ${or(types)}`] : [])];
  if (interests.length > 0) about.push(`I'm particularly interested in ${interests.join(", and in ")}.`);

  const how = of("how");
  const term = how.find((mention) => mention.term)?.term;
  const languages = words("language");
  const way = how.length > 0 ? `${or(how.map((mention) => mention.words))}${term ? `, for ${term} work` : ""}` : "";
  const spoken = languages.length > 0 ? `in ${or(languages)}` : "";
  // The languages follow a term after a comma ("…work, and in Polish") but the ways of meeting alone with a bare "and".
  const sessions = [way, spoken].filter(Boolean).join(term ? ", and " : " and ");
  const practical: string[] = [];
  if (sessions) practical.push(`I'd like to have sessions ${sessions}.`);
  const [place] = words("place");
  if (place) practical.push(`I live ${place}.`);
  const free = sender.free?.trim().replace(/[\s.,;:!?]+$/, "");
  if (free) practical.push(`I'm usually free ${free}.`);

  const questions = [
    "whether you have space for new clients",
    ...(fee ? ["what your fees are"] : []),
    ...words("access"),
    ...words("insurance"),
    "whether you offer a first consultation",
  ];
  const ask = `Could you let me know ${and(questions)}?`;
  const name = sender.name?.trim();

  const paragraphs = [`Hello ${firstName(therapist)},`, about.join(" "), practical.join(" "), ask, name ? `Many thanks,\n${name}` : "Many thanks,"];
  const message = paragraphs.filter(Boolean).join("\n\n");
  return { subject: SUBJECT, message, crisis: ticked.some((mention) => mention.key === CRISIS_KEY) };
}

/** "a", "a and b", "a, b and c". */
function and(items: readonly string[]): string {
  return joined(items, "and");
}

/** "a", "a or b", "a, b or c". */
function or(items: readonly string[]): string {
  return joined(items, "or");
}

function joined(items: readonly string[], last: string): string {
  return items.length < 2 ? (items[0] ?? "") : `${items.slice(0, -1).join(", ")} ${last} ${items.at(-1)}`;
}
