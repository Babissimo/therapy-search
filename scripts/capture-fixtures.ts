import { writeFileSync } from "node:fs";
import { parse } from "node-html-parser";
import { emptyParams, type SearchParams } from "../shared/query";
import { redact } from "./redact";
import { pause, scriptClient } from "./ukcp";

// Captures the pages the parser tests read, with personal details replaced. Nine requests.
// It finds links with plain patterns rather than the parsers, so fixtures can exist before the parsers do.
const client = scriptClient("test fixture capture");

async function save(name: string, html: string) {
  writeFileSync(new URL(`../shared/ukcp/__fixtures__/${name}`, import.meta.url), redact(html));
  console.log(`wrote ${name}`);
  await pause();
}

function search(change: (p: SearchParams) => void): SearchParams {
  const params = emptyParams();
  change(params);
  return params;
}

const form = parse(await client.searchPage()).querySelector("form#FindATherapistSearch");
if (!form) throw new Error("the search page has no form#FindATherapistSearch");
await save("search-form.html", form.outerHTML);

const brighton = await client.search(search((p) => ((p.text.Location = "Brighton"), (p.distance = 5))));
await save("results-location.html", brighton);
await save("results-no-location.html", await client.search(search((p) => (p.orderSeed = 42))));
await save("results-unknown-location.html", await client.search(search((p) => (p.text.Location = "Nowhereville Zzz"))));
await save("results-empty.html", await client.search(search((p) => (p.text.KeywordFilter = "zzqqxx-no-such-word"))));

const slug = /href="therapist\/([^"]+)"/.exec(brighton)?.[1];
if (!slug) throw new Error("the Brighton search returned no therapists");
const profile = await client.profile(slug);
if (!profile) throw new Error(`profile ${slug} was not found`);
await save("profile.html", profile);

const contactId = /therapist-contacts-details" data-id="(\d+)"(?![^>]*data-nodata="true")/.exec(profile)?.[1];
if (!contactId) throw new Error(`profile ${slug} offers no contact details; pick another and re-run`);
await save("contact.html", await client.contact(contactId));
