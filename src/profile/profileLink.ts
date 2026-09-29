import { useLocation, type Location } from "react-router";

/** A profile opened from a page carries that page's location, which stays rendered beneath the profile's drawer. */
export type ProfileState = { background?: Location };

/** The page a profile was opened over, if it was. */
export function backgroundOf(location: Location): Location | undefined {
  return (location.state as ProfileState | null)?.background;
}

/** Links to therapists' profiles that open over the current page rather than in place of it. */
export function useProfileLink(): (slug: string) => { to: string; state: ProfileState } {
  const location = useLocation();
  return (slug) => ({ to: `/therapist/${slug}`, state: { background: location } });
}
