import { queryOptions } from "@tanstack/react-query";
import { api } from "@/lib/api";

/** A therapist's profile, read once for the profile itself and for the search's map. */
export function profileQuery(slug: string) {
  return queryOptions({ queryKey: ["profile", slug], queryFn: () => api.profile(slug) });
}
