import type { ContactDetails } from "../types";
import { oneLine, optional, readHtml, safeUrl } from "./text";

export function parseContact(html: string): ContactDetails {
  const doc = readHtml(html);
  const link = (cls: string) => doc.querySelector(`.therapist-contacts-details-${cls} a`);
  return {
    phone: optional(oneLine(link("tel")?.textContent)),
    email: optional(oneLine(link("email")?.textContent)),
    website: safeUrl(link("web")?.getAttribute("href")),
  };
}
