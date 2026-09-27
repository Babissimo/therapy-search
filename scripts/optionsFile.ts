import { writeFileSync } from "node:fs";
import type { Options } from "../shared/types";

/** Human-readable differences between two option lists; empty when they match. */
export function optionsDiff(committed: Options, live: Options): string[] {
  const entries = (o: Options) =>
    new Set([...o.helpWith.map((t) => `HelpWith: ${t}`), ...o.groups.flatMap((g) => [`group: ${g.label}`, ...g.fields.map((f) => `${f.name}: ${f.value}`)])]);
  const before = entries(committed);
  const after = entries(live);
  // Wording shows on the page but is never sent, so it is compared apart from the values.
  const wording = (o: Options) =>
    new Map(o.groups.flatMap((g) => [[`help for ${g.label}`, g.help], ...g.fields.map((f) => [`label of ${f.name}: ${f.value}`, f.label] as const)]));
  const wordingBefore = wording(committed);
  const reworded = [...wording(live)].filter(([key, text]) => wordingBefore.has(key) && wordingBefore.get(key) !== text).map(([key]) => `changed ${key}`);
  return [
    ...[...after].filter((e) => !before.has(e)).map((e) => `added   ${e}`),
    ...[...before].filter((e) => !after.has(e)).map((e) => `removed ${e}`),
    ...reworded,
  ];
}

export function writeOptions(options: Options): void {
  writeFileSync(new URL("../shared/options.json", import.meta.url), `${JSON.stringify(options, null, 2)}\n`);
}
