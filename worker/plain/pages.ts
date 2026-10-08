import { html, raw } from "hono/html";
import { FILTER_GROUPS, groupName } from "../../shared/filterGroups";
import { FLAG_PARAMS, MULTI_PARAMS, TEXT_MAX_LENGTH, UKCP_ORIGIN, toQuery, ukcpProfileUrl, type FlagParam, type MultiParam, type SearchParams } from "../../shared/query";
import { sectionsOf } from "../../shared/sections";
import type { ContactDetails, FilterField, FilterGroup, ProfileSection } from "../../shared/types";
import type { PlainProfile } from "../ukcp/profile";
import type { Card, Results } from "../ukcp/results";
import { STYLE } from "./style";

export type Html = ReturnType<typeof html>;

// The app's words, which ErrorBoundary.test.tsx holds these copies to.
export const SITE_NAME = "Find a UKCP therapist (unofficial)";
export const REPORT_URL = "https://github.com/Babissimo/therapy-search/issues/new?template=accessibility.yml";
export const NEW_TAB = "(opens in a new tab)";
export const NO_PLACE = "Type a postcode or town to search.";
export const UNREADABLE = "UKCP's pages have changed, so this site can't read them yet. Search on UKCP directly.";

export const NEEDS_FILTER = "To search online, choose a filter or type a keyword. Type of session alone leaves thousands of therapists.";
export const INVALID = "This search has something UKCP's form doesn't offer, perhaps from an older page. Check it and search again.";

/**
 * A plain search as the visitor set it: where to meet, the search, and how many results came before this page, with the
 * seed of its order once it has been sent.
 */
export type Asked = { online: boolean; params: SearchParams; shown: number; seed?: number };
/** What's wrong with a search, by where it is said: beside the place box, beside the filters, or of the search as a whole. */
export type Problems = { place?: string; filters?: string; search?: string };

export function unrecognised(place: string): string {
  return `UKCP didn't recognise "${place}". Try a postcode or a town.`;
}

export function searchPage(asked: Asked, problems: Problems = {}): Html {
  return layout(
    "Plain search",
    html`<h1>Plain search</h1>
<p>A simpler search of UKCP's therapists, which works in any browser, with or without JavaScript.</p>
${problemBox(problems)}
${searchForm(asked, problems, 2)}`,
    Object.values(problems).some(Boolean),
  );
}

export function resultsPage(asked: Asked, { total, locationSearched, cards }: Results): Html {
  const { online, params, shown } = asked;
  // UKCP names the place in full, such as "Brighton, Brighton and Hove, UK".
  const place = locationSearched?.split(",")[0] || params.text.Location;
  const title = `${total === 0 ? "No therapists" : total === 1 ? "1 therapist" : `${total} therapists`} ${online ? "working online or by phone" : `near ${place}`}`;
  const last = shown + cards.length;
  const filtered = toQuery({ ...params, text: { ...params.text, Location: "" }, flags: { ...params.flags, LocationSearchOutsideUK: false } }) !== "";
  return layout(
    title,
    html`<h1>${title}</h1>
${cards.length > 0 ? html`<p>Showing ${shown + 1} to ${last}${online ? "" : ", nearest first"}. <a href="#search">Change your search</a></p>` : ""}
${total === 0 && filtered ? html`<p>Remove a filter to see more.</p>` : ""}
${total > 0 && cards.length === 0 ? html`<p>There are no more results for this search.</p>` : ""}
${cards.length > 0 ? html`<ol class="results" role="list">${cards.map((card) => cardItem(card, online))}</ol>` : ""}
${cards.length > 0 && last < total ? moreForm(asked, last) : ""}
<h2 id="search">Change your search</h2>
${searchForm(asked, {}, 3)}`,
  );
}

export function profilePage(slug: string, profile: PlainProfile, contact: ContactDetails, contactProblem?: string): Html {
  const { name, location, languages, about, practical, offices } = profile;
  const { phone, website } = contact;
  // UKCP's own page shows the email among the contact details only where it says to.
  const email = profile.email ?? (profile.emailInContact ? contact.email : undefined);
  return layout(
    name,
    html`<h1 translate="no">${name}</h1>
${location ? html`<p translate="no">${location}</p>` : ""}
${languages.length > 0 ? html`<p>Languages: ${languages.join(", ")}</p>` : ""}
<h2>Contact</h2>
${contactProblem ? html`<p class="error">${contactProblem}</p>` : ""}
${!phone && !email && !website && !contactProblem ? html`<p>UKCP gives no phone number, email or website for them.</p>` : ""}
<ul>
${phone ? html`<li>Telephone: <a translate="no" href="tel:${phone.replace(/\s/g, "")}">${phone}</a></li>` : ""}
${email ? html`<li>Email: <a translate="no" href="mailto:${email}">${email}</a></li>` : ""}
${website ? html`<li>Website: ${newTab(website, website.replace(/^https?:\/\/(www\.)?/i, "").replace(/\/$/, ""), true)}</li>` : ""}
<li>${newTab(ukcpProfileUrl(slug), "View on UKCP")}</li>
</ul>
${[...about, ...practical].map(sectionOf)}
${offices.length > 0 ? html`<h2>Where they work</h2>${offices.map(officeOf)}` : ""}`,
  );
}

/** A page that says one thing, such as why a profile can't be shown. */
export function messagePage(title: string, message: string, error = true): Html {
  return layout(title, html`<h1>${title}</h1><p>${message}</p><p><a href="/plain">Start a new search</a></p>`, error);
}

function layout(title: string, main: Html, error = false): Html {
  return html`<!doctype html>
<html lang="en-GB">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light dark">
<title>${error ? "Error: " : ""}${title} - ${SITE_NAME}</title>
<link rel="icon" href="/favicon.ico" sizes="32x32">
<style>${raw(STYLE)}</style>
</head>
<body>
<div class="page">
<header><a href="/plain">${SITE_NAME}</a></header>
<main>
${main}
</main>
${FOOTER}
</div>
</body>
</html>
`;
}

// The same help in the same order on every page. The help line is HelpNow's, as index.html copies it.
const FOOTER = html`<footer>
<p>Need help now? In the UK, call <a translate="no" href="tel:111">111</a> and choose the mental health option (in Northern
Ireland, <span translate="no">Lifeline</span> on <a translate="no" href="tel:08088088000">0808 808 8000</a>),
<span translate="no">Samaritans</span> on <a translate="no" href="tel:116123">116 123</a>, or text
<a translate="no" href="sms:85258?&amp;body=SHOUT">SHOUT to 85258</a>. In an emergency, call
<a translate="no" href="tel:999">999</a>.</p>
<p>UKCP's own directory lists the same therapists: <a href="${UKCP_ORIGIN}/find-a-therapist/">find a therapist on the UKCP website</a>.</p>
<p>The <a href="/">full search</a> adds a map and a shortlist, in browsers that can run it.</p>
<p>If this site doesn't work for you, please <a href="${REPORT_URL}">report a problem</a> on <span translate="no">GitHub</span>.</p>
</footer>`;

/** What's wrong, first in the page, each linked to the field it concerns. */
function problemBox({ place, filters, search }: Problems): Html | "" {
  if (!place && !filters && !search) return "";
  return html`<div class="problem">
<h2>There is a problem</h2>
<ul>
${search ? html`<li>${search}</li>` : ""}
${place ? html`<li><a href="#place">${place}</a></li>` : ""}
${filters ? html`<li><a href="#filters">${filters}</a></li>` : ""}
</ul>
</div>`;
}

/** The search, its fields named for UKCP's parameters as the API's are, with `level` the filters' heading level. */
function searchForm({ online, params, seed }: Asked, { place, filters }: Problems, level: 2 | 3): Html {
  return html`<form method="post" action="/plain">
${seedField(seed)}
<fieldset>
<legend>Where to meet</legend>
<div class="choice"><input type="radio" id="near" name="mode" value="near"${checked(!online)}> <label for="near">Near me</label></div>
<div class="choice"><input type="radio" id="online" name="mode" value="online" aria-describedby="online-hint${filters ? " filters-error" : ""}"${checked(online)}>
<label for="online">Online or by phone</label>
<p class="hint" id="online-hint">Wherever they are. Face-to-face sessions, home visits and wheelchair access don't count.</p></div>
</fieldset>
<div class="field">
<label for="place">Postcode or town</label>
<p class="hint" id="place-hint">For Near me.</p>
${errorLine("place-error", place)}
<input type="text" id="place" name="Location" value="${params.text.Location}" maxlength="${TEXT_MAX_LENGTH}" aria-describedby="place-hint${place ? " place-error" : ""}"${place ? raw(' aria-invalid="true"') : ""}>
</div>
<div class="field">
<label for="keyword">Keyword search</label>
<p class="hint" id="keyword-hint">Optional. UKCP looks for it in therapists' names and profiles.</p>
<input type="text" id="keyword" name="KeywordFilter" value="${params.text.KeywordFilter}" maxlength="${TEXT_MAX_LENGTH}" aria-describedby="keyword-hint">
</div>
<p><button type="submit">Search</button></p>
<h${level} id="filters">Filters</h${level}>
${errorLine("filters-error", filters)}
<p class="hint">Optional. A group with something ticked opens by itself.</p>
${FILTER_GROUPS.map((group, i) => filterGroup(group, i, params))}
<p><button type="submit">Search</button></p>
</form>`;
}

function errorLine(id: string, problem: string | undefined): Html | "" {
  return problem ? html`<p class="error" id="${id}"><span class="vh">Error: </span>${problem}</p>` : "";
}

/** A filter group as the app's panel shows it: open when something in it is ticked, under its headings where it has them. */
function filterGroup(group: FilterGroup, index: number, params: SearchParams): Html {
  const ticked = group.fields.filter((field) => isTicked(params, field)).length;
  const sections = sectionsOf(group);
  // UKCP ANDs a list's values, where a list of boxes reads as "any of these", except the session types, which it ORs.
  const narrows = group.fields.every((field) => isMulti(field.name) && field.name !== "TypesOfSession");
  const box = (field: FilterField) => {
    const id = `f${index}-${group.fields.indexOf(field)}`;
    return html`<div class="check"><input type="checkbox" id="${id}" name="${field.name}" value="${field.value}"${checked(isTicked(params, field))}> <label for="${id}">${field.label}</label></div>`;
  };
  return html`<details${ticked > 0 ? raw(" open") : ""}>
<summary>${groupName(group)}${ticked > 0 ? ` (${ticked} ticked)` : ""}</summary>
<fieldset>
<legend class="vh">${groupName(group)}</legend>
${group.help ? html`<p class="hint">${group.help}</p>` : ""}
${narrows ? html`<p class="hint">Therapists must match every box ticked here, so each extra tick narrows the results.</p>` : ""}
${
  sections
    ? sections.map(
        (section) => html`<fieldset class="section"><legend>${section.heading}</legend>
${section.about ? html`<p class="hint">${section.about}</p>` : ""}${section.fields.map(box)}</fieldset>`,
      )
    : group.fields.map(box)
}
</fieldset>
</details>`;
}

function cardItem(card: Card, online: boolean): Html {
  // UKCP's "0.2 miles from E8 3DQ" repeats the searched place, which the heading already names.
  const away = online ? undefined : card.distance?.replace(/\bfrom\b.*$/, "away");
  const meets = online && /remote/i.test(card.sessionTypes ?? "") ? undefined : card.sessionTypes;
  const place = card.location ? html`<span translate="no">${card.location}</span>${away ? ` (${away})` : ""}` : away;
  return html`<li>
<h2 translate="no">${card.name}</h2>
${place ? html`<p class="meta">${place}</p>` : ""}
${meets ? html`<p class="meta">${meets}</p>` : ""}
${card.summary ? html`<p>${card.summary}</p>` : ""}
<form method="post" action="/plain/therapist" target="_blank"><input type="hidden" name="slug" value="${card.slug}">
<button type="submit" class="secondary">Profile and contact details<span class="vh"> for ${card.name} ${NEW_TAB}</span></button></form>
</li>`;
}

/** The next page's button, its form carrying the search, its seed and how many results have been shown. */
function moreForm({ online, params, seed }: Asked, shown: number): Html {
  const fields = [...new URLSearchParams(toQuery({ ...params, page: 1 }))];
  return html`<form method="post" action="/plain">
<input type="hidden" name="mode" value="${online ? "online" : "near"}">
${fields.map(([name, value]) => html`<input type="hidden" name="${name}" value="${value}">`)}
${seedField(seed)}
<input type="hidden" name="shown" value="${shown}">
<p><button type="submit">More results</button></p>
</form>`;
}

function seedField(seed: number | undefined): Html | "" {
  return seed === undefined ? "" : html`<input type="hidden" name="seed" value="${seed}">`;
}

function sectionOf({ heading, paragraphs, items, details }: ProfileSection): Html {
  return html`${heading ? html`<h2>${heading}</h2>` : ""}
${paragraphs.map((paragraph) => html`<p>${lines(paragraph)}</p>`)}
${items.length > 0 ? html`<ul>${items.map((item) => html`<li>${item}</li>`)}</ul>` : ""}
${details.map((detail) => html`<h3>${detail.title}</h3>${blocks(detail.text)}`)}`;
}

function officeOf({ name, isMain, address, cost }: PlainProfile["offices"][number]): Html {
  return html`<h3 translate="no">${name || "Office"}</h3>
${isMain ? html`<p>Main address</p>` : ""}
${address.length > 0 ? html`<p translate="no">${lines(address.join("\n"))}</p>` : ""}
${cost ? html`<p>Fees:</p>${blocks(cost)}` : html`<p>Fees: none given</p>`}`;
}

function newTab(href: string, text: string, verbatim = false): Html {
  return html`<a href="${href}" target="_blank" rel="noreferrer"${verbatim ? raw(' translate="no"') : ""}>${text}<span class="vh"> ${NEW_TAB}</span></a>`;
}

/** Text with its line breaks kept. */
function lines(text: string): Html[] {
  return text.split("\n").map((line, i) => (i === 0 ? html`${line}` : html`<br>${line}`));
}

/** Text in paragraphs at its blank lines, its other line breaks kept. */
function blocks(text: string): Html[] {
  return text.split(/\n{2,}/).map((block) => html`<p>${lines(block)}</p>`);
}

function checked(on: boolean): Html | "" {
  return on ? raw(" checked") : "";
}

function isTicked(params: SearchParams, field: FilterField): boolean {
  if (isMulti(field.name)) return params.multi[field.name].includes(field.value);
  if ((FLAG_PARAMS as readonly string[]).includes(field.name)) return params.flags[field.name as FlagParam];
  return false;
}

function isMulti(name: string): name is MultiParam {
  return (MULTI_PARAMS as readonly string[]).includes(name);
}
