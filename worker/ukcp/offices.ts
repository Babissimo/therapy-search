import { classifyLocation } from "../../shared/location";
import { officeNamed, type OfficeDetails } from "../../shared/office";
import type { Office } from "../../shared/types";
import { optional } from "../../shared/ukcp/text";
import { lineOf, textOf } from "./markup";

// Each office is a section of its own under .profile-locations, read only to that section's end, so nothing runs on into
// the footer, which holds UKCP's own address.
const OFFICE = /class="(?:[^"]*\s)?profile-locations(?:\s[^"]*)?"(?:(?!<\/section>)[\s\S])*?<section[^>]*>([\s\S]*?)<\/section>/g;
const HEADING = /<h3[^>]*>([\s\S]*?)<\/h3>/;
const ADDRESS = /<address[^>]*>([\s\S]*?)<\/address>/;
// What follows the "Cost:" heading, up to any heading after it, as parseProfile reads it.
const COST = /<h4[^>]*>[^<]*cost[^<]*<\/h4>([\s\S]*?)(?=<h4|$)/i;

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

/** Each office's name, address lines and fee, as parseProfile reads them. */
export function officesIn(html: string): Pick<Office, "name" | "isMain" | "address" | "cost">[] {
  return [...html.matchAll(OFFICE)].map(([, section = ""]) => {
    const heading = HEADING.exec(section)?.[1] ?? "";
    return {
      name: lineOf(heading),
      // UKCP marks the main office with a star.
      isMain: /class=(["'])(?:[^"']*\s)?fa-star(?:\s[^"']*)?\1/.test(heading),
      address: textOf(ADDRESS.exec(section)?.[1] ?? "")
        .split("\n")
        .filter(Boolean),
      cost: optional(textOf(COST.exec(section)?.[1] ?? "")),
    };
  });
}
