import { OPTIONS } from "@shared/options";
import type { FilterField, FilterGroup, Options } from "@shared/types";
import { REMOTE_SESSIONS } from "./online";

const ADDITIONAL = "Additional Filters";
const OUTSIDE_UK: FilterField = { name: "LocationSearchOutsideUK", value: "true", label: "Search locations outside the UK" };
const OUTSIDE_UK_HELP = 'Tick "Search locations outside the UK" to look for the place you type anywhere in the world, not just in the UK.';
const ONLINE_ADDITIONAL_HELP = "Use this filter to narrow down your results to only therapists who have added a picture to their profile.";

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

/**
 * UKCP's groups as the online view lists them: with no place to read, no premises to reach, and only the session types
 * that can be had remotely.
 */
export function onlineFilterGroups(options: Options): FilterGroup[] {
  return options.groups.map((g) => {
    const remote = g.fields.filter(offeredOnline);
    if (remote.length === g.fields.length) return g;
    // UKCP's word on the additional filters covers wheelchair access too.
    return g.label === ADDITIONAL ? { ...g, help: ONLINE_ADDITIONAL_HELP, fields: remote } : { ...g, fields: remote };
  });
}

/** Whether a filter means anything for sessions had remotely. */
function offeredOnline(field: FilterField): boolean {
  if (field.name === "TypesOfSession") return REMOTE_SESSIONS.includes(field.value);
  return field.name !== "OnlyWheelchairAccessible";
}

export const FILTER_GROUPS = filterGroups(OPTIONS);
export const ONLINE_FILTER_GROUPS = onlineFilterGroups(OPTIONS);
