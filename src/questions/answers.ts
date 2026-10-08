import { narrowsOnline } from "@shared/online";
import { OPTIONS } from "@shared/options";
import { emptyParams, TEXT_MAX_LENGTH, toQuery, type MultiParam, type SearchParams } from "@shared/query";
import { activeFilters } from "@/search/activeFilters";
import { ONLINE_PATH } from "@/search/online";
import { withFlag, withMulti, withText } from "@/search/state";
import { QUESTIONS_PATH } from "@/site";
import type { Handoff } from "./handoff";

export const URGENCIES = ["today", "wait"] as const;
/** "unsure" is "Not sure", which sets nothing, as leaving a question unanswered does. */
export const WHOS = ["me", "child", "partner", "family", "unsure"] as const;
export const MEETS = ["inPerson", "remote", "either", "unsure"] as const;
export const PAYS = ["self", "insurer", "cannot", "unsure"] as const;
export type Urgency = (typeof URGENCIES)[number];
export type Who = (typeof WHOS)[number];
export type Meet = (typeof MEETS)[number];
export type Pay = (typeof PAYS)[number];

/** The visitor's answers so far. A question left unanswered sets nothing. */
export type Answers = {
  urgency?: Urgency;
  who?: Who;
  /** UKCP's help-with topics, in the order chosen. */
  topics: string[];
  meet?: Meet;
  /** As typed. */
  place: string;
  /** Whether they'd like a language other than English. */
  otherLanguage?: boolean;
  /** One of UKCP's languages, never English, chosen only with a yes to `otherLanguage`. */
  language?: string;
  stepFree?: boolean;
  pay?: Pay;
};

export const NO_ANSWERS: Answers = { topics: [], place: "" };

export const QUESTIONS = ["urgency", "who", "topics", "meet", "place", "language", "access", "pay"] as const;
export type Question = (typeof QUESTIONS)[number];
/** A question, help shown between two of them, or the end, where the answers give nothing to search by. */
export type Screen = Question | "help-now" | "low-cost" | "end";
const SCREENS: readonly string[] = [...QUESTIONS, "help-now", "low-cost", "end"];

export function isScreen(value: string): value is Screen {
  return SCREENS.includes(value);
}

export function screenPath(screen: Screen): string {
  return `${QUESTIONS_PATH}/${screen}`;
}

/** The questions that apply: meeting online or by phone needs no place, and no step-free way in. */
export function questionsFor(answers: Answers): Question[] {
  return QUESTIONS.filter((q) => answers.meet !== "remote" || (q !== "place" && q !== "access"));
}

/** The screens before the end, in order: help now follows an urgent answer, and low-cost help "I can't afford it". */
export function screensFor(answers: Answers): Screen[] {
  return questionsFor(answers).flatMap((q): Screen[] => {
    if (q === "urgency" && answers.urgency === "today") return [q, "help-now"];
    if (q === "pay" && answers.pay === "cannot") return [q, "low-cost"];
    return [q];
  });
}

/** The screen after `screen`, which after the last is the end. */
export function nextScreen(answers: Answers, screen: Screen): Screen {
  const screens = screensFor(answers);
  return screens[screens.indexOf(screen) + 1] ?? "end";
}

const HELP_WITH = OPTIONS.groups.find((g) => g.label === "I Want Help With")?.fields.map((f) => f.value) ?? [];

/** Plain names for the topics most come with, each one of UKCP's. */
export const THEMES: readonly { label: string; topic: string }[] = [
  { label: "Anxiety or worry", topic: "Anxiety" },
  { label: "Low mood", topic: "Depression" },
  { label: "Stress", topic: "Stress" },
  { label: "Grief or loss", topic: "Bereavement" },
  { label: "Relationships", topic: "Relationships" },
  { label: "Trauma", topic: "Trauma" },
  { label: "Abuse", topic: "Abuse" },
  { label: "Family", topic: "Family" },
  { label: "Eating", topic: "Eating Disorders" },
  { label: "Drink, drugs or gambling", topic: "Addiction" },
  { label: "Work", topic: "Employment Difficulties" },
];

/** UKCP's topics about therapists' own work, or how they meet, which question 4 asks. */
const NOT_ASKED = new Set(["EMDR", "Online Counselling", "Telephone Counselling", "Supervision", "Training", "Private Practice Issues"]);

/** UKCP's other topics, offered under "Something else". */
export const OTHER_TOPICS: readonly string[] = HELP_WITH.filter((topic) => !NOT_ASKED.has(topic) && !THEMES.some((theme) => theme.topic === topic));

const TOPICS = new Set([...THEMES.map((theme) => theme.topic), ...OTHER_TOPICS]);

/**
 * UKCP's languages but English, which sets nothing, as "Me" does: nearly every therapist works in English, and the tick
 * would drop any who list no languages.
 */
export const LANGUAGES: readonly string[] = (OPTIONS.groups.find((g) => g.label === "Languages")?.fields ?? [])
  .map((f) => f.value)
  .filter((language) => language !== "English");

/** Question 3, as question 2's answer words it. */
export function topicsQuestion(who: Who | undefined): string {
  if (who === "child") return "What would your child like help with?";
  if (who === "partner") return "What would you both like help with?";
  if (who === "family") return "What would your family like help with?";
  return "What would you like help with?";
}

/** "Me" ticks nothing: nearly every therapist sees individuals, and the tick would drop any who leave Works With blank. */
const WORKS_WITH: Partial<Record<Who, string>> = { child: "Children and young people", partner: "Couples", family: "Families" };
const INSURER = "Private healthcare referrals";
/** The sessions had in person, any of which UKCP matches. */
const IN_PERSON = ["Face to Face - Long Term", "Face to Face - Short Term", "Home Visits"];

/** The search the answers make, and whether it is the online view's. */
export function searchOf(answers: Answers): { online: boolean; params: SearchParams } {
  const online = answers.meet === "remote";
  const ticks: [MultiParam, string | undefined][] = [
    ["WorksWith", answers.who && WORKS_WITH[answers.who]],
    ["WorksWith", answers.pay === "insurer" ? INSURER : undefined],
    ...answers.topics.map((topic): [MultiParam, string] => ["HelpWithAdvanced", topic]),
    ["Languages", answers.language],
    ...IN_PERSON.map((type): [MultiParam, string | undefined] => ["TypesOfSession", answers.meet === "inPerson" ? type : undefined]),
  ];
  const ticked = ticks.reduce((params, [name, value]) => (value ? withMulti(params, name, value, true) : params), emptyParams());
  if (online) return { online, params: ticked };
  return { online, params: withText(withFlag(ticked, "OnlyWheelchairAccessible", answers.stepFree === true), "Location", answers.place) };
}

/**
 * Where the answers lead: their search, or, for answers that narrow it but give no place to meet near, the Near me start
 * with their ticks, waiting for one. Nothing for answers that narrow nothing, which the start screens wouldn't search either.
 */
export function destination(answers: Answers): string | undefined {
  const { online, params } = searchOf(answers);
  if (!(online ? narrowsOnline(params) : activeFilters(params).length > 0)) return undefined;
  return `${online ? ONLINE_PATH : "/"}?${toQuery(params)}`;
}

/** The start screen for the way the visitor chose to meet, with the place they typed for its box. */
export function startFor(answers: Answers): { to: string; state?: Handoff } {
  if (answers.meet === "remote") return { to: ONLINE_PATH };
  const place = answers.place.trim();
  return place ? { to: "/", state: { place } } : { to: "/" };
}

export const ANSWERS_KEY = "questions";

/** The answers kept for this tab, less anything that isn't one. */
export function readAnswers(storage: Pick<Storage, "getItem"> | null): Answers {
  let kept: unknown;
  try {
    kept = JSON.parse(storage?.getItem(ANSWERS_KEY) ?? "null");
  } catch {
    return NO_ANSWERS;
  }
  if (typeof kept !== "object" || kept === null) return NO_ANSWERS;
  const { urgency, who, topics, meet, place, otherLanguage, language, stepFree, pay } = kept as Record<string, unknown>;
  return {
    urgency: oneOf(URGENCIES, urgency),
    who: oneOf(WHOS, who),
    topics: Array.isArray(topics) ? [...new Set(topics.filter((t): t is string => typeof t === "string" && TOPICS.has(t)))] : [],
    meet: oneOf(MEETS, meet),
    place: typeof place === "string" ? place.slice(0, TEXT_MAX_LENGTH) : "",
    otherLanguage: typeof otherLanguage === "boolean" ? otherLanguage : undefined,
    // Kept only with its yes, as the question shows a language only beneath one.
    language: otherLanguage === true ? oneOf(LANGUAGES, language) : undefined,
    stepFree: typeof stepFree === "boolean" ? stepFree : undefined,
    pay: oneOf(PAYS, pay),
  };
}

export function writeAnswers(storage: Pick<Storage, "setItem"> | null, answers: Answers): void {
  try {
    storage?.setItem(ANSWERS_KEY, JSON.stringify(answers));
  } catch {
    // A full or refused store keeps the answers for as long as the page is open.
  }
}

function oneOf<T extends string>(values: readonly T[], value: unknown): T | undefined {
  return values.find((v) => v === value);
}
