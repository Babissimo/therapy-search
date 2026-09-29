import { useLayoutEffect, useRef, useState } from "react";
import { ApiError, api } from "@/lib/api";

// Each fits one line beneath the box on a phone, so the toolbar stays clear of the results sheet.
export const REFUSED = "Location access is off. Type a town or postcode.";
export const UNKNOWN = "Couldn't find you. Type a town or postcode.";
export const NO_POSTCODE = "No UK postcode near you. Type a town or postcode.";

// GeolocationPositionError's PERMISSION_DENIED.
const DENIED = 1;

export type Locate = {
  /** Whether the browser offers geolocation at all. */
  supported: boolean;
  locating: boolean;
  /** Why the last attempt found no postcode, until the next attempt or dismiss. */
  problem?: string;
  locate: () => void;
  dismiss: () => void;
};

/** Finds the postcode nearest the visitor, through the Worker, and hands it to `onFound`. */
export function useLocate(onFound: (postcode: string) => void): Locate {
  const [locating, setLocating] = useState(false);
  const [problem, setProblem] = useState<string>();
  // The latest callback, so a search made once the position arrives carries whatever changed while it was awaited.
  const found = useRef(onFound);
  useLayoutEffect(() => {
    found.current = onFound;
  });

  async function locate() {
    if (locating) return;
    setLocating(true);
    setProblem(undefined);
    try {
      const { coords } = await currentPosition();
      const nearest = await api.nearest(coords.latitude, coords.longitude);
      if (nearest.found) found.current(nearest.postcode);
      else setProblem(NO_POSTCODE);
    } catch (error) {
      setProblem(error instanceof ApiError ? error.message : refused(error) ? REFUSED : UNKNOWN);
    } finally {
      setLocating(false);
    }
  }

  return {
    supported: "geolocation" in navigator,
    locating,
    problem,
    locate: () => void locate(),
    dismiss: () => setProblem(undefined),
  };
}

function currentPosition(): Promise<GeolocationPosition> {
  // A position up to five minutes old will do, as the Worker rounds it to about 100 metres.
  return new Promise((resolve, reject) => navigator.geolocation.getCurrentPosition(resolve, reject, { maximumAge: 5 * 60 * 1000, timeout: 15_000 }));
}

function refused(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === DENIED;
}
