export class ParseError extends Error {
  override name = "ParseError";
}

/**
 * Reads UKCP's HTML with the browser's own parser. The document is inert: nothing in it runs or loads.
 * Node scripts install jsdom's DOMParser first (scripts/dom.ts).
 */
export function readHtml(html: string): Document {
  return new DOMParser().parseFromString(html, "text/html");
}

const SPACES = /[\s\u200b]+/g;

/** Collapses all whitespace, including non-breaking and zero-width spaces, to single spaces. */
export function oneLine(text: string | null | undefined): string {
  return (text ?? "").replace(SPACES, " ").trim();
}

/** Text of an element with <br> as line breaks, tidied as `tidyLines` tidies it. */
export function multiLine(el: Element | null | undefined): string {
  if (!el) return "";
  const copy = el.cloneNode(true) as Element;
  for (const br of copy.querySelectorAll("br")) br.replaceWith("\n");
  return tidyLines(copy.textContent ?? "");
}

/** Each line collapsed as `oneLine` collapses it, and blank runs collapsed to one. */
export function tidyLines(text: string): string {
  return text
    .split("\n")
    .map((line) => oneLine(line))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// UKCP's own line under "Working with Children", on every therapist with a child or family title. It links to UKCP's page on
// training to work with children, so says nothing to someone looking for a therapist.
const CHILDREN_STOCK = /^for more information about therapy for children and young people, visit our info page\.?$/i;

/** Whether a paragraph of a profile's section says something of the therapist: not empty, nor a stock line of UKCP's. */
export function saysSomething(paragraph: string): boolean {
  return paragraph !== "" && !CHILDREN_STOCK.test(oneLine(paragraph));
}

export function optional(text: string): string | undefined {
  return text === "" ? undefined : text;
}

export function initialsOf(name: string): string {
  const words = name.split(" ").filter(Boolean);
  return ((words[0]?.[0] ?? "") + (words.at(-1)?.[0] ?? "")).toUpperCase();
}

/** The address in a mailto link, without any ?subject=, and tolerant of a stray percent sign. */
export function mailtoAddress(href: string): string | undefined {
  const address = href.slice("mailto:".length).split("?")[0] ?? "";
  try {
    return optional(decodeURIComponent(address).trim());
  } catch {
    return optional(address.trim());
  }
}

/** Only http(s) links reach the page, so a hostile href can never run script. */
export function safeUrl(url: string | null | undefined): string | undefined {
  return url && /^https?:\/\//i.test(url) ? url : undefined;
}
