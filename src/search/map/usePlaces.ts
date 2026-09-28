import { useQuery } from "@tanstack/react-query";
import { canonicalLocation } from "@shared/location";
import { api } from "@/lib/api";
import { choosePoint, type Point } from "./geo";

/** The point UKCP measured distances from; `settled` is false while it is being looked up. Places don't move, so answers last the session. */
export function useCentre(place: string | undefined, outsideUK: boolean): { point?: Point; settled: boolean } {
  const canonical = place === undefined ? undefined : canonicalLocation(place);
  const query = useQuery({
    queryKey: ["place", { text: canonical, centre: true, outsideUK }],
    queryFn: () => api.place(canonical ?? "", { centre: true, outsideUK }),
    enabled: canonical !== undefined,
    staleTime: Infinity,
    gcTime: Infinity,
  });
  if (canonical === undefined) return { settled: true };
  if (query.status === "pending") return { settled: false };
  const lookup = query.status === "success" ? query.data : undefined;
  return { point: lookup?.found ? choosePoint(lookup) : undefined, settled: true };
}
