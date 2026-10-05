import { OPTIONS } from "../../shared/options";
import { TEXT_MAX_LENGTH, type MultiParam } from "../../shared/query";
import { HELP_NOW } from "./instructions";
import type { ToolDefinition } from "./protocol";

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
    "with someone: therapy rarely lasts fewer than six sessions, and some goes on for two years or more. Online, only Online Therapy and " +
    "Telephone Therapy apply.",
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
      "Searches the UK Council for Psychotherapy's register for therapists near a UK place, or working online or by phone, and gives up to " +
      `${PER_PAGE} short results at a time, with a link that opens the same search on the site, where the person sees every result, a map ` +
      `and each therapist's contact details. Give few filters, as most narrow the list. This is a directory, not a support service. ${HELP_NOW}`,
    inputSchema: {
      type: "object",
      properties: {
        location: {
          type: "string",
          minLength: 1,
          maxLength: TEXT_MAX_LENGTH,
          description: 'A UK town, city or postcode, such as "Bristol" or "BS8 1TH". Leave it out to find therapists who work online or by phone.',
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
