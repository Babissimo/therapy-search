import type { FilterGroup, Options } from "../types";
import { ParseError, oneLine, optional, readHtml } from "./text";

export function parseOptions(html: string): Options {
  const form = readHtml(html).querySelector("form#FindATherapistSearch");
  if (!form) throw new ParseError("options: no form#FindATherapistSearch");
  const panel = form.querySelector(".fat-filters");
  if (!panel) throw new ParseError("options: no .fat-filters");

  const groups: FilterGroup[] = [];
  for (const h3 of panel.querySelectorAll(":scope > h3")) {
    const checkboxes = checkboxesAfter(h3);
    if (checkboxes.length === 0) continue;
    groups.push({
      label: oneLine(
        [...h3.childNodes]
          .filter((n) => !(n as Element).classList?.contains("help"))
          .map((n) => n.textContent)
          .join(""),
      ),
      help: optional(oneLine(h3.querySelector(".help")?.getAttribute("title"))),
      fields: checkboxes.map((input) => ({
        name: input.getAttribute("name") ?? "",
        value: input.getAttribute("value") ?? "",
        label: oneLine(panel.querySelector(`label[for="${input.id}"]`)?.textContent),
      })),
    });
  }
  if (groups.length === 0) throw new ParseError("options: no filter groups");

  const helpWith = [...form.querySelectorAll(".find-a-therapist-issues-container li")].map((li) => oneLine(li.textContent)).filter(Boolean);
  // HelpWith carries its terms comma-separated, so a term containing a comma could never be searched for.
  const withComma = helpWith.find((term) => term.includes(","));
  if (withComma !== undefined) throw new ParseError(`options: help-with term "${withComma}" contains a comma`);
  return { helpWith, groups };
}

/** Checkboxes between this heading and the next one. */
function checkboxesAfter(h3: Element): Element[] {
  const found: Element[] = [];
  for (let el = h3.nextElementSibling; el && el.tagName !== "H3"; el = el.nextElementSibling) {
    found.push(...el.querySelectorAll('input[type="checkbox"]'));
  }
  return found;
}
