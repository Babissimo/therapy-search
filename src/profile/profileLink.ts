import { useDrawerLink, type DrawerState } from "@/lib/drawerRoute";

/** Links to therapists' profiles that open over the current page rather than in place of it. */
export function useProfileLink(): (slug: string) => { to: string; state: DrawerState } {
  const link = useDrawerLink();
  return (slug) => link(`/therapist/${slug}`);
}
