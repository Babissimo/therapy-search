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

/** Text of an element with <br> as line breaks; lines are tidied and blank runs collapsed to one. */
export function multiLine(el: Element | null | undefined): string {
  if (!el) return "";
  const copy = el.cloneNode(true) as Element;
  for (const br of copy.querySelectorAll("br")) br.replaceWith("\n");
  return (copy.textContent ?? "")
    .split("\n")
    .map((line) => oneLine(line))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function optional(text: string): string | undefined {
  return text === "" ? undefined : text;
}

export function initialsOf(name: string): string {
  const words = name.split(" ").filter(Boolean);
  return ((words[0]?.[0] ?? "") + (words.at(-1)?.[0] ?? "")).toUpperCase();
}

/** Only http(s) links reach the page, so a hostile href can never run script. */
export function safeUrl(url: string | null | undefined): string | undefined {
  return url && /^https?:\/\//i.test(url) ? url : undefined;
}
