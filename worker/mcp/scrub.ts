/** What stands in for an email address or phone number written into a profile's text. */
export const ON_PROFILE = "(contact details are on the profile)";

// Starts only where a run of address characters does, so a long run with no @ is tried once, not from each character in it.
const EMAIL = /(?<![\p{L}\p{N}._%+-])[\p{L}\p{N}._%+-]+@[\p{L}\p{N}-]+(?:\.[\p{L}\p{N}-]+)+/gu;
// A UK number as people write one: +44 or 0044 (international), or 0 (domestic), then 9 or 10 more digits, spaced, dotted, dashed, en-dashed or bracketed.
const PHONE = /(?<![\d+])(?:\(?(?:\+|00)\s?44\)?[\s.-]{0,2}(?:\(0\)[\s.-]?)?|\(?0)\d(?:[\s().–-]{0,2}\d){8,9}(?!\d)/g;

/** Text with the email addresses and UK phone numbers in it replaced, so the tools give no contact details. */
export function scrub(text: string): string {
  return text.replace(EMAIL, ON_PROFILE).replace(PHONE, ON_PROFILE);
}

/** A value with every string in it, however deep in arrays and objects, scrubbed of contact details. */
export function scrubbed<T>(value: T): T {
  if (typeof value === "string") return scrub(value) as T;
  if (Array.isArray(value)) return value.map(scrubbed) as T;
  if (value === null || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value).map(([key, inner]) => [key, scrubbed(inner)])) as T;
}
