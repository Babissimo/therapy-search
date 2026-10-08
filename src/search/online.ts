import { matchPath } from "react-router";
import { emptyParams, type SearchParams } from "@shared/query";
import { withFlag, withText } from "./state";

/** Where the search for therapists working online or by phone lives, apart from the map of those near a place. */
export const ONLINE_PATH = "/online";

/** Whether `pathname` is a search page, near a place or online. */
export function isSearchPage(pathname: string): boolean {
  return matchPath("/", pathname) !== null || matchPath(ONLINE_PATH, pathname) !== null;
}

// The place of the search near one last on show, so Near me takes a visitor back to it from online. Memory only.
let place = emptyParams();

/** Keeps the place `params` searches near, as a search near one shows. */
export function rememberPlace(params: SearchParams) {
  place = params;
}

/** The online view's search near the place last left for it, filters and all, with that search's wheelchair tick. */
export function nearMeParams(params: SearchParams): SearchParams {
  const near = withFlag(withText(params, "Location", place.text.Location), "LocationSearchOutsideUK", place.flags.LocationSearchOutsideUK);
  return withFlag(near, "OnlyWheelchairAccessible", place.flags.OnlyWheelchairAccessible);
}
