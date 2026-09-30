import { useCallback, useLayoutEffect, useRef, useState } from "react";
import { ApiError, api } from "@/lib/api";
import type { Point } from "./map/geo";

export type PostcodeNear = {
  looking: boolean;
  /** Why the last attempt found no postcode, until the next attempt or dismiss. */
  problem?: string;
  /** Looks up the postcode nearest the point `where` gives; a call while one is under way is ignored. */
  lookNear: (where: () => Promise<Point>) => void;
  /** The same function on every render. */
  dismiss: () => void;
};

export type NearWording = {
  /** When no postcode lies near enough the point. */
  none: string;
  /** When the point or its postcode can't be had, for any reason but one the Worker gives. */
  failed: (error: unknown) => string;
};

/** Finds the postcode nearest a point, through the Worker, and hands it to `onFound`, which may answer why it can't use it. */
export function usePostcodeNear(onFound: (postcode: string) => string | void, wording: NearWording): PostcodeNear {
  const [looking, setLooking] = useState(false);
  const [problem, setProblem] = useState<string>();
  // The latest callback, so a search made once the postcode arrives carries whatever changed while it was awaited.
  const found = useRef(onFound);
  useLayoutEffect(() => {
    found.current = onFound;
  });

  async function lookNear(where: () => Promise<Point>) {
    if (looking) return;
    setLooking(true);
    setProblem(undefined);
    try {
      const { lat, lng } = await where();
      const nearest = await api.nearest(lat, lng);
      setProblem(nearest.found ? (found.current(nearest.postcode) ?? undefined) : wording.none);
    } catch (error) {
      setProblem(error instanceof ApiError ? error.message : wording.failed(error));
    } finally {
      setLooking(false);
    }
  }

  const dismiss = useCallback(() => setProblem(undefined), []);
  return { looking, problem, lookNear: (where) => void lookNear(where), dismiss };
}
