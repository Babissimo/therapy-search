import { classifyLocation, type Candidate, type NearestLookup, type PlaceLookup, type PlaceOptions } from "../../shared/location";
import type { Fetch } from "../ukcp/client";

const POSTCODES_IO = "https://api.postcodes.io";
const NOMINATIM = "https://nominatim.openstreetmap.org";
const TIMEOUT_MS = 5_000;

export class GeocodeError extends Error {
  override name = "GeocodeError";
}

/**
 * Places location text. postcodes.io answers UK postcodes, outcodes and card place names; Nominatim, which
 * ranks places by prominence, answers search centres and anything outside the UK, where postcodes.io has no data.
 */
export class Geocoder {
  constructor(
    private readonly fetchImpl: Fetch,
    private readonly userAgent: string,
  ) {}

  /** An unknown postcode falls back to its outcode, and an unknown outcode to the words beside it. */
  async lookup(text: string, options: PlaceOptions = {}): Promise<PlaceLookup> {
    const location = classifyLocation(text);
    if (location.kind === "too-general") return { found: false, reason: "too-general" };
    if (location.kind === "postcode") {
      const point = await this.#point(`/postcodes/${encodeURIComponent(location.postcode)}`);
      if (point) return { found: true, kind: "postcode", candidates: [point] };
    }
    if (location.kind !== "place") {
      const point = await this.#point(`/outcodes/${encodeURIComponent(location.outcode)}`);
      if (point) return { found: true, kind: "outcode", candidates: [point] };
    }
    const name = location.kind === "place" ? location.name : location.rest;
    const candidates = name ? await this.#places(name, options) : [];
    return candidates.length > 0 ? { found: true, kind: "place", candidates } : { found: false, reason: "not-found" };
  }

  /** The postcode nearest a point, as far out as postcodes.io looks: 2 km. */
  async nearest(lat: number, lng: number): Promise<NearestLookup> {
    const query = new URLSearchParams({ lon: String(lng), lat: String(lat), radius: "2000", limit: "1" });
    const body = await this.#json<{ result: { postcode: string }[] | null }>(`${POSTCODES_IO}/postcodes?${query}`);
    const postcode = body?.result?.[0]?.postcode;
    return postcode ? { found: true, postcode } : { found: false };
  }

  /** A postcode's or outcode's position, or null when postcodes.io doesn't know it or holds none. */
  async #point(path: string): Promise<Candidate | null> {
    const body = await this.#json<{ result?: { latitude: number | null; longitude: number | null } }>(`${POSTCODES_IO}${path}`);
    const result = body?.result;
    if (!result || result.latitude === null || result.longitude === null) return null;
    return { lat: result.latitude, lng: result.longitude };
  }

  async #places(name: string, { centre = false, outsideUK = false }: PlaceOptions): Promise<Candidate[]> {
    if (centre || outsideUK) {
      const query = new URLSearchParams({ q: name, format: "jsonv2", limit: centre ? "1" : "10" });
      if (!outsideUK) query.set("countrycodes", "gb");
      const places = await this.#json<{ lat: string; lon: string; addresstype?: string }[]>(`${NOMINATIM}/search?${query}`);
      return (places ?? []).map((p) => ({ lat: Number(p.lat), lng: Number(p.lon), type: p.addresstype?.toLowerCase() }));
    }
    const query = new URLSearchParams({ q: name, limit: "10" });
    const body = await this.#json<{ result: { latitude: number; longitude: number; local_type?: string }[] | null }>(`${POSTCODES_IO}/places?${query}`);
    return (body?.result ?? []).map((p) => ({ lat: p.latitude, lng: p.longitude, type: p.local_type?.toLowerCase() }));
  }

  /** The parsed body, or null for a 404. Other failures throw, naming only the service and status. */
  async #json<T>(url: string): Promise<T | null> {
    const res = await this.fetchImpl(url, {
      headers: { "User-Agent": this.userAgent, Accept: "application/json" },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (res.status === 404) return null;
    if (!res.ok) throw new GeocodeError(`${new URL(url).host} answered ${res.status}`);
    return (await res.json()) as T;
  }
}
