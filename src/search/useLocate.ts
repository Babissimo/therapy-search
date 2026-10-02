import type { Point } from "./map/geo";
import { usePostcodeNear } from "./usePostcodeNear";

// Each fits one line beneath the box on a phone, so the toolbar above the list stays short.
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
  const near = usePostcodeNear(onFound, { none: NO_POSTCODE, failed: (error) => (refused(error) ? REFUSED : UNKNOWN) });
  return {
    supported: "geolocation" in navigator,
    locating: near.looking,
    problem: near.problem,
    locate: () => near.lookNear(currentPosition),
    dismiss: near.dismiss,
  };
}

function currentPosition(): Promise<Point> {
  // A position up to five minutes old will do, as the Worker rounds it to about 100 metres.
  return new Promise((resolve, reject) =>
    navigator.geolocation.getCurrentPosition(({ coords }) => resolve({ lat: coords.latitude, lng: coords.longitude }), reject, {
      maximumAge: 5 * 60 * 1000,
      timeout: 15_000,
    }),
  );
}

function refused(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === DENIED;
}
