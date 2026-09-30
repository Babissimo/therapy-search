import { queryOptions, useQuery } from "@tanstack/react-query";
import { LOCATION_MAX_LENGTH, canonicalLocation, classifyLocation, type PlaceLookup, type PlaceOptions } from "@shared/location";
import type { Office } from "@shared/types";
import { api } from "@/lib/api";
import { choosePoint, type Point } from "@/search/map/geo";
import { lookupText } from "@/search/map/pins";

/** Near enough to see the streets around a postcode, the district around an outcode, or the town around a place. */
const ZOOM: Record<Extract<PlaceLookup, { found: true }>["kind"], number> = { postcode: 15, outcode: 13, place: 11 };

// A nation closing an address, alone on its line or after a comma, which no geocoder lookup wants.
const NATION = /(?:^|,)\s*(?:England|Scotland|Wales|Northern Ireland|UK|United Kingdom(?:\s*\(UK\))?)\.?$/i;

// Common names for countries that the region names below don't give.
const ALIASES: Record<string, string> = {
  USA: "US",
  "United States of America": "US",
  "Republic of Ireland": "IE",
  Eire: "IE",
  Holland: "NL",
  Turkey: "TR",
  "Czech Republic": "CZ",
  UAE: "AE",
};

/** One spelling per country name: accents, "&" for "and", a leading "The" and a closing full stop don't count. */
function countryKey(name: string): string {
  const plain = name.normalize("NFD").replace(/\p{Mn}/gu, "").replace(/’/g, "'").replace(/&/g, " and ").replace(/\.$/, "");
  return canonicalLocation(plain).replace(/^THE /, "");
}

let countries: Map<string, string> | undefined;

/** The code of the country, other than the UK, that a closing piece of an address names. */
function countryCode(text: string): string | undefined {
  if (!countries) {
    countries = new Map(Object.entries(ALIASES).map(([name, code]) => [countryKey(name), code]));
    const letters = [..."ABCDEFGHIJKLMNOPQRSTUVWXYZ"];
    for (const style of ["long", "short"] as const) {
      const names = new Intl.DisplayNames("en", { type: "region", style });
      for (const code of letters.flatMap((first) => letters.map((second) => first + second))) {
        const name = names.of(code);
        // An unassigned code names itself, and a withdrawn one, such as "DD", its successor, "DE", which it resolves to.
        if (!name || name === code) continue;
        const current = new Intl.Locale(`und-${code}`).region;
        if (current && current !== "GB") countries.set(countryKey(name), current);
      }
    }
  }
  return countries.get(countryKey(text))?.toLowerCase();
}

/** What to look up to place an office: at home one text; abroad, texts to try in turn within its country. */
export type OfficeLookup = { texts: string[]; country?: string };

/**
 * What to look up to place an office: its UK postcode; else, for an office abroad, its address before the country, then
 * less of it each time, dropping a part from the front; else, for the main office, the place UKCP lists the therapist
 * under, as the results map does; else its last line, usually the town.
 */
export function officeLookup(office: Office, listed: string | undefined): OfficeLookup | undefined {
  const lines = addressLines(office);
  const location = classifyLocation(lines.join(" "));
  // Trusted over a country beside it, as in a Belfast address closing "Ireland".
  if (location.kind === "postcode") return { texts: [location.postcode] };
  const last = lines.at(-1) ?? "";
  const comma = last.lastIndexOf(",");
  const country = countryCode(last.slice(comma + 1));
  if (country) {
    const before = [...lines.slice(0, -1), last.slice(0, Math.max(comma, 0))];
    const parts = before.flatMap((line) => line.split(",")).map(canonicalLocation).filter(Boolean);
    // Every try keeps the part beside the country, usually the town or postcode; a lone street or suite could be anywhere.
    const texts = parts.map((_, i) => parts.slice(i).join(" ")).filter((text) => text.length <= LOCATION_MAX_LENGTH);
    return texts.length > 0 ? { texts, country } : undefined;
  }
  const text = (office.isMain ? lookupText(listed) : null) ?? lookupText(last);
  return text ? { texts: [text] } : undefined;
}

/**
 * Where an office is, as a results card would say: the place UKCP lists the therapist under for the main office; else
 * the part of the address holding the postcode, or else the last line, that `officeLookup` places it by.
 */
export function officeLocation(office: Office, listed: string | undefined): string | undefined {
  if (office.isMain && listed && lookupText(listed)) return listed.trim();
  const lines = addressLines(office);
  const location = classifyLocation(lines.join(" "));
  if (location.kind !== "postcode") return lines.at(-1);
  const parts = lines.flatMap((line) => line.split(",")).map((part) => part.trim());
  return parts.find((part) => classifyLocation(part).kind === "postcode") ?? location.postcode;
}

function addressLines(office: Office): string[] {
  return office.address.map((line) => line.replace(NATION, "").trim()).filter(Boolean);
}

/** The answer for the first of the texts that is found, else the last one's. */
async function firstFound(texts: string[], options: PlaceOptions): Promise<PlaceLookup> {
  let answer: PlaceLookup = { found: false, reason: "not-found" };
  for (const text of texts) {
    answer = await api.place(text, options);
    if (answer.found) break;
  }
  return answer;
}

/** How an office is placed, wherever it is placed from. Places don't move, so answers last the session. */
export function officePlaceQuery(lookup: OfficeLookup | undefined) {
  // Abroad, each text takes Nominatim's single best answer in the country, as a search centre does. At home, the one
  // text is keyed as the search keys a card's, so a place it already placed is not asked for again.
  const options: PlaceOptions = lookup?.country ? { centre: true, country: lookup.country } : { outsideUK: false };
  return queryOptions({
    queryKey: ["place", lookup?.country ? { texts: lookup.texts, ...options } : { text: lookup?.texts[0], ...options }],
    queryFn: () => firstFound(lookup?.texts ?? [], options),
    enabled: lookup !== undefined,
    staleTime: Infinity,
    gcTime: Infinity,
  });
}

/** Where an office is, and how far in to show it. */
export function useOfficePlace(office: Office, listed: string | undefined): { point: Point; zoom: number } | undefined {
  const query = useQuery(officePlaceQuery(officeLookup(office, listed)));
  const answer = query.data;
  const point = answer?.found ? choosePoint(answer) : undefined;
  return answer?.found && point ? { point, zoom: ZOOM[answer.kind] } : undefined;
}
