import { locationFellBack } from "../../shared/location";
import { narrowsOnline, onlineParams, onlineSearch } from "../../shared/online";
import { ALLOWED, OPTIONS } from "../../shared/options";
import { InvalidParam, readParams, TEXT_MAX_LENGTH, toQuery, type MultiParam, type SearchParams } from "../../shared/query";
import { ParseError } from "../../shared/ukcp/text";
import { UNREADABLE, unrecognised } from "../plain/pages";
import { readResults, type Card, type Results } from "../ukcp/results";
import { HELP_NOW } from "./instructions";
import type { ToolDefinition, ToolResult } from "./protocol";
import { scrubbed } from "./scrub";
import { errorOf, refusal, structured, type ToolContext } from "./tool";

/** Each list the tool takes, by its argument's name, as the UKCP parameter it is sent as. */
export const LISTS = {
  issues: "HelpWithAdvanced",
  session_types: "TypesOfSession",
  works_with: "WorksWith",
  therapy_types: "TypesOfTherapy",
  languages: "Languages",
} as const satisfies Record<string, MultiParam>;
/** How many results a page holds. */
export const PER_PAGE = 10;
/** The last page: a search near a place reads UKCP's nearest 48, which fill five. */
export const LAST_PAGE = 5;

// UKCP ANDs the values within each list but the session types.
const NARROWS = "Each one given narrows the list, as UKCP lists only therapists who chose every one, so give the one or two that matter most.";
// In the plain words of shared/filterGroups.ts, put to an assistant.
const DESCRIPTIONS: Record<keyof typeof LISTS, string> = {
  issues: `What the person would like help with, in UKCP's terms: put what they describe into these (grief is Bereavement, panic is Anxiety). ${NARROWS}`,
  session_types:
    "How they'd like to meet. Therapists offering any one given are listed. Short term and long term say how long a therapist likes to work " +
    "with someone: therapy rarely lasts fewer than six sessions, and some goes on for two years or more. With no location, only Online " +
    "Therapy and Telephone Therapy apply.",
  works_with:
    'Who the therapist sees: "Children and young people" for a child or teenager; "Couples", "Families" or "Groups" for therapy with a ' +
    'partner, family or group. "Companies" means they work with employers, and "Private healthcare referrals" that they see people sent ' +
    `by a health insurer. ${NARROWS}`,
  therapy_types: `Every UKCP therapist can help with a wide range of problems, so give a type only if the person has one in mind. ${NARROWS}`,
  languages: `Languages the therapist works in, British Sign Language among them. ${NARROWS}`,
};
const TEXT = { type: "string" };
const THERAPIST = {
  type: "object",
  properties: {
    id: { type: "string", description: "Their id on UKCP's register." },
    name: TEXT,
    place: { type: "string", description: "The town and postcode district of their office nearest the search." },
    distance: TEXT,
    sessions: { type: "string", description: "How they meet people." },
    summary: { type: "string", description: "The start of their profile, cut short by UKCP." },
    tags: { type: "array", items: TEXT, description: "Terms from their profile that UKCP shows on their card." },
  },
  required: ["id", "name", "tags"],
};

let definition: ToolDefinition | undefined;

/** The search tool's definition, with UKCP's values as each list's only options, built when first asked for. */
export function searchDefinition(): ToolDefinition {
  return (definition ??= {
    name: "search_therapists",
    title: "Search UKCP's register of therapists",
    description:
      "Searches the UK Council for Psychotherapy's register through this unofficial site, which UKCP does not run. It finds therapists near a " +
      `UK place, or working online or by phone, and gives up to ${PER_PAGE} short results at a time, with a link that opens the same search on ` +
      "the site, where the person sees every result, a map and each therapist's contact details. Give few filters, as most narrow the list. " +
      `Searches pass through the site to UKCP; the site keeps no record of who asked what. This is a directory, not a support service. ${HELP_NOW}`,
    inputSchema: {
      type: "object",
      properties: {
        location: {
          type: "string",
          minLength: 1,
          maxLength: TEXT_MAX_LENGTH,
          description:
            'A UK town, city or postcode, such as "Bristol" or "BS8 1TH". Leave it out to find therapists who work online or by phone, ' +
            "which also needs issues, therapy_types, works_with or languages.",
        },
        ...Object.fromEntries(Object.entries(LISTS).map(([arg, param]) => [arg, list(param, DESCRIPTIONS[arg as keyof typeof LISTS])])),
        wheelchair_accessible: { type: "boolean", description: "Only therapists whose rooms can be reached in a wheelchair. Near a place only." },
        page: {
          type: "integer",
          minimum: 1,
          maximum: LAST_PAGE,
          default: 1,
          description: `Which ${PER_PAGE} results: 1 for the first ${PER_PAGE}, up to ${LAST_PAGE}. For more, give the person the link.`,
        },
      },
      additionalProperties: false,
    },
    outputSchema: {
      type: "object",
      properties: {
        total: { type: "integer", description: "How many therapists UKCP found." },
        place: { type: "string", description: "The place UKCP searched near." },
        order: { type: "string", enum: ["nearest first", "random"] },
        showing: { type: "string", description: 'Which results these are, such as "11 to 20".' },
        therapists: { type: "array", items: THERAPIST },
        link: { type: "string", description: "The same search on the site, where the person can see every result and contact therapists." },
        help_now: TEXT,
      },
      required: ["total", "order", "therapists", "link", "help_now"],
    },
    annotations: { readOnlyHint: true, openWorldHint: true },
  });
}

/** A list of UKCP's values for a parameter, in the order its form gives them. */
function list(param: MultiParam, description: string) {
  const values = OPTIONS.groups.flatMap((group) => group.fields).filter((field) => field.name === param).map((field) => field.value);
  return { type: "array", items: { type: "string", enum: values }, uniqueItems: true, description };
}

// The arguments besides the lists.
const OTHERS = ["location", "wheelchair_accessible", "page"];
/** Each UKCP parameter by the argument it is given as, to name it in what's wrong. */
const ARGUMENT: Record<string, string> = {
  Location: "location",
  OnlyWheelchairAccessible: "wheelchair_accessible",
  ...Object.fromEntries(Object.entries(LISTS).map(([arg, param]) => [param, arg])),
};
const ONLINE_NEEDS_FILTER =
  "To search online, give a filter besides session_types, such as an issue or a language: thousands of therapists work online or by phone.";
const BUSY = "Assistants have made too many searches in the last minute. Wait a minute and try again, or open the search on the site:";

/** A search: UKCP's nearest 48 near a place, or everyone who matches online, read only as far as the page asked for. */
export async function searchTherapists(args: Record<string, unknown>, { ask, site }: ToolContext): Promise<ToolResult> {
  const read = readArguments(args);
  if (typeof read === "string") return refusal(read);
  const { params, page } = read;
  const near = params.text.Location !== "";
  if (!near && !narrowsOnline(params)) return refusal(ONLINE_NEEDS_FILTER);
  const link = near ? `${site}/#/?${toQuery(params)}` : `${site}/#/online?${toQuery(onlineParams(params))}`;
  // Asked by the URLs the app asks by, so the two share the cache's answers.
  const res = await ask(near ? `/api/search/early?${toQuery(params)}` : `/api/search?${toQuery(onlineSearch(params))}`);
  if (res.status === 429) return refusal(`${BUSY} ${link}`);
  if (!res.ok) return refusal(`${await errorOf(res)} The same search on the site: ${link}`);
  let results: Results;
  try {
    results = readResults(await res.text(), (page - 1) * PER_PAGE, PER_PAGE);
  } catch (error) {
    if (!(error instanceof ParseError)) throw error;
    // The message names the markup missed, never the search.
    console.error(`${error.name}: ${error.message}`);
    return refusal(`${UNREADABLE} The same search on the site: ${link}`);
  }
  // UKCP answers a place it doesn't know with results from anywhere, which would answer no one looking near it.
  if (near && locationFellBack(params.text.Location, results.locationSearched)) return refusal(unrecognised(params.text.Location));
  const from = (page - 1) * PER_PAGE + 1;
  return structured({
    total: results.total,
    ...(near && results.locationSearched !== undefined && { place: results.locationSearched }),
    order: near ? "nearest first" : "random",
    ...(results.cards.length > 0 && { showing: `${from} to ${from + results.cards.length - 1}` }),
    therapists: results.cards.map(therapistOf),
    link,
    help_now: HELP_NOW,
  });
}

/** The search the arguments ask for, read as the app reads its own, or what's wrong with them. */
function readArguments(given: Record<string, unknown>): { params: SearchParams; page: number } | string {
  const unknown = Object.keys(given).find((key) => !Object.hasOwn(LISTS, key) && !OTHERS.includes(key));
  if (unknown !== undefined) return `search_therapists takes no argument "${unknown}".`;
  // Some clients send an optional argument they have no value for as null, which means the same as leaving it out.
  const args = Object.fromEntries(Object.entries(given).filter(([, value]) => value !== null));
  const query = new URLSearchParams();
  const { location, wheelchair_accessible: wheelchair, page = 1 } = args;
  if (location !== undefined) {
    if (typeof location !== "string") return "location must be text.";
    query.set("Location", location);
  }
  for (const [arg, param] of Object.entries(LISTS)) {
    const values = args[arg];
    if (values === undefined) continue;
    if (!Array.isArray(values) || !values.every((value) => typeof value === "string")) return `${arg} must be a list of UKCP's values.`;
    for (const value of values) query.append(param, value);
  }
  if (wheelchair !== undefined) {
    if (typeof wheelchair !== "boolean") return "wheelchair_accessible must be true or false.";
    if (wheelchair) query.set("OnlyWheelchairAccessible", "true");
  }
  if (typeof page !== "number" || !Number.isInteger(page) || page < 1 || page > LAST_PAGE) return `page must be a whole number from 1 to ${LAST_PAGE}.`;
  try {
    return { params: readParams(query, ALLOWED), page };
  } catch (error) {
    if (!(error instanceof InvalidParam)) throw error;
    // readParams names UKCP's parameter, which an assistant knows by the argument's name.
    return `${error.message.replace(error.param, ARGUMENT[error.param] ?? error.param)}.`;
  }
}

/** A card as the tool gives it; readResults has already left out its phone number, and all but the id is scrubbed of contact details. */
function therapistOf(card: Card) {
  return {
    id: card.slug,
    ...scrubbed({
      name: card.name,
      place: card.location,
      distance: card.distance,
      sessions: card.sessionTypes,
      summary: card.summary,
      tags: card.tags,
    }),
  };
}
