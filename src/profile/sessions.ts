import { REMOTE_SESSIONS } from "@shared/online";
import type { Profile } from "@shared/types";

// UKCP's heading, compared without case.
const HEADING = "types of sessions";
// UKCP's session types that meet in a room: "Face to Face - Long Term", "Face to Face - Short Term" and "Home Visits".
const IN_PERSON = /^(face to face\b|home visits$)/i;

/** How a therapist meets, as a search's card says it: UKCP's "In-person & Remote", from the types of sessions they list. */
export function sessionTypesOf(profile: Profile): string | undefined {
  const types = profile.practical.find((section) => section.heading.toLowerCase() === HEADING)?.items ?? [];
  const kinds = [types.some((type) => IN_PERSON.test(type)) && "In-person", types.some((type) => REMOTE_SESSIONS.includes(type)) && "Remote"];
  return kinds.filter(Boolean).join(" & ") || undefined;
}
