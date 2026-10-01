import { classifyLocation } from "../../shared/location";
import { officeNamed, type OfficeDetails } from "../../shared/office";
import { optional, tidyLines } from "../../shared/ukcp/text";

// Each office is a section of its own under .profile-locations, read only to that section's end, so nothing runs on into
// the footer, which holds UKCP's own address.
const OFFICE = /class="(?:[^"]*\s)?profile-locations(?:\s[^"]*)?"(?:(?!<\/section>)[\s\S])*?<section[^>]*>([\s\S]*?)<\/section>/g;
const ADDRESS = /<address[^>]*>([\s\S]*?)<\/address>/;
// What follows the "Cost:" heading, up to any heading after it, as parseProfile reads it.
const COST = /<h4[^>]*>[^<]*cost[^<]*<\/h4>([\s\S]*?)(?=<h4|$)/i;
const ENTITIES = new Map([
  ["amp", "&"],
  ["lt", "<"],
  ["gt", ">"],
  ["quot", '"'],
  ["apos", "'"],
  ["nbsp", "\u00a0"],
  ["pound", "£"],
]);

/**
 * The postcode and fee of the office a card's location names, read from a profile page by pattern, since the Worker has
 * no DOMParser. Its lines come out as the browser's parser reads them, so the office named is the one the profile marks.
 */
export function officeDetails(html: string, location: string): OfficeDetails {
  const offices = officesIn(html);
  const office = offices[officeNamed(offices, location) ?? -1];
  if (!office) return {};
  const place = classifyLocation(office.address.join(" "));
  return { ...(place.kind === "postcode" && { postcode: place.postcode }), ...(office.cost && { cost: office.cost }) };
}

/** Each office's address lines and fee, as parseProfile reads them. */
export function officesIn(html: string): { address: string[]; cost?: string }[] {
  return [...html.matchAll(OFFICE)].map(([, section = ""]) => ({
    address: textOf(ADDRESS.exec(section)?.[1] ?? "")
      .split("\n")
      .filter(Boolean),
    cost: optional(textOf(COST.exec(section)?.[1] ?? "")),
  }));
}

/** Text with <br> as line breaks, tidied as multiLine tidies an element's. */
function textOf(html: string): string {
  return tidyLines(decode(html.replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]*>/g, "")));
}

function decode(text: string): string {
  return text.replace(/&(#x[\da-f]+|#\d+|[a-z]+);/gi, (whole, name: string) => {
    if (!name.startsWith("#")) return ENTITIES.get(name) ?? whole;
    const code = /x/i.test(name) ? parseInt(name.slice(2), 16) : parseInt(name.slice(1), 10);
    return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : whole;
  });
}
