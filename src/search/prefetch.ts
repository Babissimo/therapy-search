import type { QueryClient } from "@tanstack/react-query";
import { matchPath, parsePath } from "react-router";
import { narrowsOnline, ONLINE_PATH } from "./online";
import { placed } from "./state";
import { prefetchResults } from "./useResults";
import { viewSearch } from "./useSearchState";

/** The map's code, in a chunk of its own: Leaflet is large, and a visit that never searches near a place never needs it. */
export const loadMap = () => import("./map/MapPane");

/** Starts fetching the map's code ahead of a search that will show it. A failure shows when the map itself asks. */
export function warmMap(): void {
  loadMap().catch(() => {});
}

/**
 * Starts the search an address after the `#` opens on, and the map that shows it, before the app first renders, which on
 * a slow phone is over half a second later. Read as HashRouter and the routes read it, so the page finds them.
 */
export function prefetchSearchAt(client: QueryClient, hash: string): void {
  const { pathname = "/", search = "" } = parsePath(hash.slice(1));
  const path = pathname.startsWith("/") ? pathname : `/${pathname}`;
  let params;
  try {
    params = viewSearch(path, search);
  } catch {
    // The page meets a search it can't read itself, and says so.
    return;
  }
  if (matchPath("/", path) && placed(params)) {
    prefetchResults(client, params);
    warmMap();
  } else if (matchPath(ONLINE_PATH, path) && narrowsOnline(params)) {
    prefetchResults(client, params);
  }
}
