import { classifyLocation } from "../../shared/location";

// Each office is a section of its own under .profile-locations; one without an address stops at its section's end, so
// the match never runs on into the footer, which holds UKCP's own address.
const OFFICE_ADDRESS = /class="(?:[^"]*\s)?profile-locations(?:\s[^"]*)?"(?:(?!<\/section>)[\s\S])*?<address[^>]*>([\s\S]*?)<\/address>/g;

/** The postcode of the first office on a profile page in the district `outcode`, read by pattern, since the Worker has no DOMParser. */
export function officePostcode(html: string, outcode: string): string | undefined {
  for (const [, address = ""] of html.matchAll(OFFICE_ADDRESS)) {
    const location = classifyLocation(textOf(address));
    if (location.kind === "postcode" && location.outcode === outcode) return location.postcode;
  }
  return undefined;
}

/** An address's lines run together, its tags and character references each read as a space. */
function textOf(html: string): string {
  return html.replace(/<[^>]*>|&[^;\s]*;/g, " ");
}
