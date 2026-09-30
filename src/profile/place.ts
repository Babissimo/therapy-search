import { useQuery } from "@tanstack/react-query";
import { classifyLocation, type PlaceLookup } from "@shared/location";
import type { Office } from "@shared/types";
import { api } from "@/lib/api";
import { choosePoint, type Point } from "@/search/map/geo";
import { lookupText } from "@/search/map/pins";

/** Near enough to see the streets around a postcode, the district around an outcode, or the town around a place. */
const ZOOM: Record<Extract<PlaceLookup, { found: true }>["kind"], number> = { postcode: 15, outcode: 13, place: 11 };

// A nation closing an address, alone on its line or after a comma, which no geocoder lookup wants.
const NATION = /(?:^|,)\s*(?:England|Scotland|Wales|Northern Ireland|UK|United Kingdom(?:\s*\(UK\))?)\.?$/i;

/**
 * What to look up to place an office: its postcode; else, for the main office, the place UKCP lists the therapist
 * under, as the results map does; else the last line of its address, usually the town.
 */
export function officeText(office: Office, listed: string | undefined): string | undefined {
  const lines = office.address.map((line) => line.replace(NATION, "").trim()).filter(Boolean);
  const location = classifyLocation(lines.join(" "));
  if (location.kind === "postcode") return location.postcode;
  return (office.isMain ? lookupText(listed) : null) ?? lookupText(lines.at(-1)) ?? undefined;
}

/** Where an office is, and how far in to show it. Places don't move, so answers last the session. */
export function useOfficePlace(office: Office, listed: string | undefined): { point: Point; zoom: number } | undefined {
  const text = officeText(office, listed);
  // Keyed as the search's own card lookups are, so a place already placed on the results map is not asked for again.
  const query = useQuery({
    queryKey: ["place", { text, outsideUK: false }],
    queryFn: () => api.place(text ?? ""),
    enabled: text !== undefined,
    staleTime: Infinity,
    gcTime: Infinity,
  });
  const lookup = query.data;
  const point = lookup?.found ? choosePoint(lookup) : undefined;
  return lookup?.found && point ? { point, zoom: ZOOM[lookup.kind] } : undefined;
}
