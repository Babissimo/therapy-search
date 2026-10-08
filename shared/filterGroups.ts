import { REMOTE_SESSIONS } from "./online";
import { OPTIONS } from "./options";
import type { FilterField, FilterGroup, Options } from "./types";

const ADDITIONAL = "Additional Filters";
const OUTSIDE_UK: FilterField = { name: "LocationSearchOutsideUK", value: "true", label: "Search locations outside the UK" };
const PHOTOS_HELP = '"Only show profiles with photos" keeps to therapists with a photo.';
const OUTSIDE_UK_HELP = '"Search locations outside the UK" looks for the place you type anywhere in the world.';

// Each group's help in plain words, for anyone new to therapy, in place of UKCP's, by UKCP's name for the group. A group
// UKCP adds keeps UKCP's help until it has some here. Box labels are quoted as UKCP gives them.
const HELP: Record<string, string> = {
  // How long therapy lasts, from UKCP's FAQs.
  "Type of Session":
    "How you'd like to meet. Therapists who offer any one you tick will show. Ticking face to face also shows those who don't " +
    "say how they meet. Short term and long term say how long they like to " +
    "work with someone: therapy rarely lasts fewer than six sessions, and some goes on for two years or more. If you're not sure, " +
    "leave this blank.",
  "I Want Help With": "Tick what you'd like help with, to find therapists who work with it. If you're not sure, leave this blank.",
  // An insurer's referral, from UKCP's page on getting therapy in the UK.
  "Works With":
    'Who the therapist sees. For a child or teenager, tick "Children and young people". For therapy with a partner, your family ' +
    'or a group, tick "Couples", "Families" or "Groups". "Companies" means they work with employers. "Private healthcare referrals" ' +
    "means they see people sent by a health insurer.",
  "Type of Therapy": "Every UKCP therapist can help with a wide range of problems, so you don't need to choose a type unless you have one in mind.",
  Languages: "Tick a language to find therapists who speak it. British Sign Language is here too.",
  "Additional Filters": `${PHOTOS_HELP} "Only show wheelchair accessible" keeps to those whose rooms you can reach in a wheelchair. ${OUTSIDE_UK_HELP}`,
  // What a college is, from UKCP's page on its colleges.
  "UKCP Colleges":
    "Every UKCP therapist belongs to a college. A college is a group of therapists who share a way of working, or who work with the " +
    'same people, such as children. Most people can leave this blank. "Type of therapy" says more plainly how someone works.',
};

// The online view's, where its groups differ: only the sessions had remotely, and no premises to reach or place to read.
const ONLINE_HELP: Record<string, string> = {
  ...HELP,
  "Type of Session": "Whether you'd like to meet online or by phone. Therapists who offer either one you tick will show. If you don't mind which, leave this blank.",
  "Additional Filters": PHOTOS_HELP,
};

// UKCP's names for its groups, which stay their keys, as the page shows them: in sentence case, and as questions where
// UKCP's own read as labels.
const GROUP_NAMES: Record<string, string> = {
  "Type of Session": "Type of session",
  "I Want Help With": "What you want help with",
  "Works With": "Who they work with",
  "Type of Therapy": "Type of therapy",
  "Additional Filters": "More filters",
  "UKCP Colleges": "UKCP colleges",
};

/** A group's name as the page shows it. */
export function groupName(group: FilterGroup): string {
  return GROUP_NAMES[group.label] ?? group.label;
}

/** A group's name within a sentence, lower-cased unless it starts with a capitalised abbreviation such as UKCP. */
export function groupNameInSentence(group: FilterGroup): string {
  const name = groupName(group);
  return /^[A-Z][a-z]/.test(name) ? name[0]!.toLowerCase() + name.slice(1) : name;
}

/**
 * UKCP's groups as the filter panel lists them. UKCP sets its outside-UK tick beside the location box; here it joins the
 * additional filters, or a group of that name of its own should UKCP's options ever lack one.
 */
export function filterGroups(options: Options): FilterGroup[] {
  const groups = options.groups.map((g) => withHelp(g, HELP));
  const additional = groups.find((g) => g.label === ADDITIONAL);
  if (!additional) return [...groups, { label: ADDITIONAL, help: OUTSIDE_UK_HELP, fields: [OUTSIDE_UK] }];
  return groups.map((g) => (g === additional ? { ...g, fields: [...g.fields, OUTSIDE_UK] } : g));
}

/**
 * UKCP's groups as the online view lists them: with no place to read, no premises to reach, and only the session types
 * that can be had remotely.
 */
export function onlineFilterGroups(options: Options): FilterGroup[] {
  return options.groups.map((g) => {
    const group = withHelp(g, ONLINE_HELP);
    const remote = group.fields.filter(offeredOnline);
    return remote.length === group.fields.length ? group : { ...group, fields: remote };
  });
}

/** The group with our help for it, if we have some. */
function withHelp(group: FilterGroup, help: Record<string, string>): FilterGroup {
  const ours = help[group.label];
  return ours === undefined ? group : { ...group, help: ours };
}

/** Whether a filter means anything for sessions had remotely. */
function offeredOnline(field: FilterField): boolean {
  if (field.name === "TypesOfSession") return REMOTE_SESSIONS.includes(field.value);
  return field.name !== "OnlyWheelchairAccessible";
}

export const FILTER_GROUPS = filterGroups(OPTIONS);
export const ONLINE_FILTER_GROUPS = onlineFilterGroups(OPTIONS);
