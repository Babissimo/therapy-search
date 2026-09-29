import "./dom";
import { OPTIONS } from "../shared/options";
import { BATCH_SIZE, emptyParams } from "../shared/query";
import { sectionDrift } from "../shared/sections";
import { parseOptions } from "../shared/ukcp/parseOptions";
import { parseProfile } from "../shared/ukcp/parseProfile";
import { parseResults } from "../shared/ukcp/parseResults";
import { optionsDiff, writeOptions } from "./optionsFile";
import { pause, scriptClient } from "./ukcp";

// Daily check that UKCP still answers in the shapes the site parses. Four requests.
// A ParseError thrown by any parser also fails the run. Changed option lists are not a failure:
// they are written to shared/options.json for the workflow to propose as a pull request.
const client = scriptClient("daily contract check");
const failures: string[] = [];
const expect = (ok: boolean, message: string) => ok || failures.push(message);

const live = parseOptions(await client.searchPage());
const drift = optionsDiff(OPTIONS, live);
if (drift.length > 0) {
  writeOptions(live);
  console.log(`UKCP's options changed:\n  ${drift.join("\n  ")}`);
}
const unsectioned = sectionDrift(live);
if (unsectioned.length > 0) console.log(`The filter panel's headings in shared/sections.ts need updating:\n  ${unsectioned.join("\n  ")}`);
await pause();

const params = emptyParams();
params.text.Location = "London";
// The site's own batch, so a cap on UKCP's page size shows here before it shortens anyone's list.
const results = parseResults(await client.search(params));
expect(results.total > BATCH_SIZE && results.therapists.length === BATCH_SIZE, `expected a full batch of London results, got ${results.therapists.length} of ${results.total}`);
expect(results.locationSearched !== undefined, "the London search reported no resolved location");
await pause();

// A card with a summary means the therapist wrote a biography, so their profile should have About sections.
const sample = results.therapists.find((t) => t.summary) ?? results.therapists[0];
if (sample) {
  const html = await client.profile(sample.slug);
  expect(html !== null, `the London result ${sample.slug} has no profile page`);
  if (html) {
    const profile = parseProfile(html, sample.slug);
    expect(profile.about.length > 0 && profile.about.every((s) => s.heading !== ""), `profile ${sample.slug} parsed without headed sections`);
  }
}

if (failures.length > 0) {
  console.error(failures.join("\n"));
  process.exit(1);
}
console.log(`UKCP contract holds: ${results.total} London results.`);
