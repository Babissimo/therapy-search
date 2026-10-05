import { ukcpProfileUrl } from "../../shared/query";
import type { ProfileSection } from "../../shared/types";
import { ParseError } from "../../shared/ukcp/text";
import { UNREADABLE } from "../plain/pages";
import { SLUG } from "../ukcp/client";
import { readProfile, type PlainProfile } from "../ukcp/profile";
import type { ToolDefinition, ToolResult } from "./protocol";
import { scrubbed } from "./scrub";
import { errorOf, refusal, structured, type ToolContext } from "./tool";

const CONTACT = "Contact details aren't given here. They're on the profile on the site, at links.site.";
const NOT_AN_ID = "That isn't a therapist's id. Give the id search_therapists gave for them.";
const BUSY = "Assistants have asked for too many profiles in the last minute. Wait a minute and try again, or open the profile on the site:";
const TEXT = { type: "string" };
const TEXTS = { type: "array", items: TEXT };
const SECTION = {
  type: "object",
  properties: {
    heading: TEXT,
    paragraphs: TEXTS,
    items: TEXTS,
    details: { type: "array", items: { type: "object", properties: { title: TEXT, text: TEXT }, required: ["title", "text"] } },
  },
  required: ["heading"],
};

let definition: ToolDefinition | undefined;

/** The profile tool's definition, built when first asked for. */
export function therapistDefinition(): ToolDefinition {
  return (definition ??= {
    name: "get_therapist",
    title: "Read a therapist's profile",
    description:
      "Gives one therapist's profile from UKCP's register: about them and how they work, their offices and fees, and the languages they " +
      "work in, with links to the profile on the site and on UKCP. Give the id search_therapists gave for them. Contact details aren't " +
      "given here: the person finds them on the site's profile.",
    inputSchema: {
      type: "object",
      properties: { id: { type: "string", description: "A therapist's id, from search_therapists." } },
      required: ["id"],
      additionalProperties: false,
    },
    outputSchema: {
      type: "object",
      properties: {
        name: TEXT,
        place: TEXT,
        languages: TEXTS,
        about: { type: "array", items: SECTION, description: "In their own words, under UKCP's headings." },
        practical: { type: "array", items: SECTION, description: "Who they work with, what they help with, and how they work." },
        offices: {
          type: "array",
          items: {
            type: "object",
            properties: { name: TEXT, main: { type: "boolean" }, address: TEXTS, fees: TEXT },
            required: ["name", "main", "address"],
          },
        },
        links: { type: "object", properties: { site: TEXT, ukcp: TEXT }, required: ["site", "ukcp"] },
        contact: TEXT,
      },
      required: ["name", "languages", "about", "practical", "offices", "links", "contact"],
    },
    annotations: { readOnlyHint: true, openWorldHint: true },
  });
}

/** A therapist's profile from the cache, with every contact detail left out, those written into any of its text included. */
export async function getTherapist(args: Record<string, unknown>, { ask, site }: ToolContext): Promise<ToolResult> {
  const { id, ...rest } = args;
  const extra = Object.keys(rest)[0];
  if (extra !== undefined) return refusal(`get_therapist takes no argument "${extra}".`);
  if (typeof id !== "string" || !SLUG.test(id)) return refusal(NOT_AN_ID);
  const links = { site: `${site}/#/therapist/${encodeURIComponent(id)}`, ukcp: ukcpProfileUrl(id) };
  const res = await ask(`/api/therapist/${encodeURIComponent(id)}`);
  if (res.status === 429) return refusal(`${BUSY} ${links.site}`);
  if (!res.ok) return refusal(await errorOf(res));
  let profile: PlainProfile;
  try {
    profile = readProfile(await res.text());
  } catch (error) {
    if (!(error instanceof ParseError)) throw error;
    // The message names the markup missed, never the profile.
    console.error(`${error.name}: ${error.message}`);
    return refusal(`${UNREADABLE} The profile on the site: ${links.site}`);
  }
  // Everything the page gave is scrubbed in one pass, so no field is left out of it; the links and the note are ours.
  return structured({
    ...scrubbed({
      name: profile.name,
      ...(profile.location !== undefined && { place: profile.location }),
      languages: profile.languages,
      about: profile.about.map(sectionOf),
      practical: profile.practical.map(sectionOf),
      offices: profile.offices.map((office) => ({
        name: office.name,
        main: office.isMain,
        address: office.address,
        ...(office.cost !== undefined && { fees: office.cost }),
      })),
    }),
    links,
    contact: CONTACT,
  });
}

/** A section with its empty parts left out. */
function sectionOf({ heading, paragraphs, items, details }: ProfileSection) {
  return {
    heading,
    ...(paragraphs.length > 0 && { paragraphs }),
    ...(items.length > 0 && { items }),
    ...(details.length > 0 && { details }),
  };
}
