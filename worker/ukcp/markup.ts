import { oneLine, tidyLines } from "../../shared/ukcp/text";

// UKCP's pages read by pattern, since the Worker has no DOMParser. Text comes out as the browser's parser gives it, and
// elements are matched to their ends by counting tags, which holds for markup as well formed as UKCP's.

const ENTITIES = new Map([
  ["amp", "&"],
  ["lt", "<"],
  ["gt", ">"],
  ["quot", '"'],
  ["apos", "'"],
  ["nbsp", " "],
  ["pound", "£"],
]);
// A browser reads a numeric reference to a C1 control as the Windows-1252 character with that byte.
const WINDOWS_1252 = [
  0x20ac, 0x81, 0x201a, 0x192, 0x201e, 0x2026, 0x2020, 0x2021, 0x2c6, 0x2030, 0x160, 0x2039, 0x152, 0x8d, 0x17d, 0x8f, 0x90, 0x2018,
  0x2019, 0x201c, 0x201d, 0x2022, 0x2013, 0x2014, 0x2dc, 0x2122, 0x161, 0x203a, 0x153, 0x9d, 0x17e, 0x178,
];
const TAG = /<!--[\s\S]*?-->|<(\/?)([a-z][a-z0-9]*)\b[^>]*>/gi;
const VOID = new Set(["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "source", "track", "wbr"]);

/** An element found in a page: its tag's name and attributes, and what it holds. */
export type Element = { name: string; open: string; inner: string };

export function decode(text: string): string {
  return text.replace(/&(#x[\da-f]+|#\d+|[a-z]+);/gi, (whole, name: string) => {
    if (!name.startsWith("#")) return ENTITIES.get(name) ?? whole;
    const code = /x/i.test(name) ? parseInt(name.slice(2), 16) : parseInt(name.slice(1), 10);
    if (code >= 0x80 && code <= 0x9f) return String.fromCodePoint(WINDOWS_1252[code - 0x80]!);
    return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : whole;
  });
}

/** Text with <br> as line breaks, tidied as multiLine tidies an element's. */
export function textOf(html: string): string {
  return tidyLines(decode(stripTags(html.replace(/<br\s*\/?>/gi, "\n"))));
}

/** Text on one line, as oneLine reads an element's. */
export function lineOf(html: string): string {
  return oneLine(decode(stripTags(html)));
}

function stripTags(html: string): string {
  return html.replace(/<!--[\s\S]*?-->/g, "").replace(/<[^>]*>/g, "");
}

/** An attribute's value from an element's opening tag, as written in single or double quotes. */
export function attribute(open: string, name: string): string | undefined {
  const value = new RegExp(`\\s${name}=(["'])([\\s\\S]*?)\\1`, "i").exec(open)?.[2];
  return value === undefined ? undefined : decode(value);
}

/** Every element whose class list holds `className`, in the order they open, nested ones included. */
export function withClass(html: string, className: string): Element[] {
  const opening = new RegExp(`<([a-z][a-z0-9]*)\\b[^>]*\\sclass=(["'])(?:[^"']*\\s)?${className}(?:\\s[^"']*)?\\2[^>]*>`, "gi");
  return [...html.matchAll(opening)].map((m) => elementAt(html, m.index, m[0], m[1]!.toLowerCase()));
}

/** The first element named `name`, at any depth. */
export function firstNamed(html: string, name: string): Element | undefined {
  const m = new RegExp(`<${name}\\b[^>]*>`, "i").exec(html);
  return m ? elementAt(html, m.index, m[0], name) : undefined;
}

/** The elements directly inside `html`; text between them is left out, as an element's children leave it. */
export function children(html: string): Element[] {
  const found: Element[] = [];
  let depth = 0;
  let open = "";
  let name = "";
  let from = 0;
  for (const m of html.matchAll(TAG)) {
    const tag = m[2]?.toLowerCase();
    if (tag === undefined) continue;
    const closing = m[1] === "/";
    if (VOID.has(tag)) {
      if (depth === 0 && !closing) found.push({ name: tag, open: m[0], inner: "" });
    } else if (!closing) {
      if (depth === 0) [open, name, from] = [m[0], tag, m.index + m[0].length];
      depth++;
    } else if (depth > 0 && --depth === 0) {
      found.push({ name, open, inner: html.slice(from, m.index) });
    }
  }
  return found;
}

/** The element whose opening tag `open` starts at `at`, held to its matching end, or to the page's end if it has none. */
function elementAt(html: string, at: number, open: string, name: string): Element {
  const from = at + open.length;
  if (VOID.has(name)) return { name, open, inner: "" };
  const tags = new RegExp(`<(/?)${name}\\b[^>]*>`, "gi");
  tags.lastIndex = from;
  let depth = 1;
  for (let m = tags.exec(html); m; m = tags.exec(html)) {
    depth += m[1] === "/" ? -1 : 1;
    if (depth === 0) return { name, open, inner: html.slice(from, m.index) };
  }
  return { name, open, inner: html.slice(from) };
}

/** Whether an element's class list holds `className`. */
export function hasClass(element: Element, className: string): boolean {
  return (attribute(element.open, "class") ?? "").split(/\s+/).includes(className);
}
