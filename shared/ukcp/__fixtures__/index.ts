import { readFileSync } from "node:fs";

/** Captured UKCP pages with personal details replaced; refresh with `npm run fixtures`. */
export function fixture(name: string): string {
  return readFileSync(new URL(name, import.meta.url), "utf8");
}
