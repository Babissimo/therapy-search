/** The map's code, in a chunk of its own: Leaflet is large, and a visit that never searches near a place never needs it. */
export const loadMap = () => import("./map/MapPane");

/** Starts fetching the map's code ahead of a search that will show it. A failure shows when the map itself asks. */
export function warmMap(): void {
  loadMap().catch(() => {});
}
