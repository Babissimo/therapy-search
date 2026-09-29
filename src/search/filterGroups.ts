import { OPTIONS } from "@shared/options";
import type { FilterField, FilterGroup, Options } from "@shared/types";

const ADDITIONAL = "Additional Filters";
const OUTSIDE_UK: FilterField = { name: "LocationSearchOutsideUK", value: "true", label: "Search locations outside the UK" };
const OUTSIDE_UK_HELP = "Searching locations outside the UK reads the location as a place anywhere in the world.";

/**
 * UKCP's groups as the filter panel lists them. UKCP sets its outside-UK tick beside the location box; here it joins the
 * additional filters, or a group of that name of its own should UKCP's options ever lack one.
 */
export function filterGroups(options: Options): FilterGroup[] {
  const additional = options.groups.find((g) => g.label === ADDITIONAL);
  if (!additional) return [...options.groups, { label: ADDITIONAL, help: OUTSIDE_UK_HELP, fields: [OUTSIDE_UK] }];
  const help = additional.help ? `${additional.help} ${OUTSIDE_UK_HELP}` : OUTSIDE_UK_HELP;
  return options.groups.map((g) => (g === additional ? { ...g, help, fields: [...g.fields, OUTSIDE_UK] } : g));
}

export const FILTER_GROUPS = filterGroups(OPTIONS);
