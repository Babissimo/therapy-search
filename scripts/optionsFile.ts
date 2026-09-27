import { writeFileSync } from "node:fs";
import type { Options } from "../shared/types";

/** Human-readable differences between two option lists; empty when they match. */
export function optionsDiff(committed: Options, live: Options): string[] {
  const entries = (o: Options) =>
    new Set([...o.helpWith.map((t) => `HelpWith: ${t}`), ...o.groups.flatMap((g) => [`group: ${g.label}`, ...g.fields.map((f) => `${f.name}: ${f.value}`)])]);
  const before = entries(committed);
  const after = entries(live);
  return [...[...after].filter((e) => !before.has(e)).map((e) => `added   ${e}`), ...[...before].filter((e) => !after.has(e)).map((e) => `removed ${e}`)];
}

export function writeOptions(options: Options): void {
  writeFileSync(new URL("../shared/options.json", import.meta.url), `${JSON.stringify(options, null, 2)}\n`);
}
