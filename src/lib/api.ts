import { parseContact } from "@shared/ukcp/parseContact";
import { parseProfile } from "@shared/ukcp/parseProfile";
import { parseResults } from "@shared/ukcp/parseResults";
import { ParseError } from "@shared/ukcp/text";
import { placeQuery, type PlaceLookup, type PlaceOptions } from "@shared/location";

export const UNREADABLE = "UKCP's pages have changed, so this site can't read them yet. Search on UKCP directly.";

export class ApiError extends Error {
  override name = "ApiError";
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

async function failure(res: Response): Promise<ApiError> {
  const body: unknown = await res.json().catch(() => ({}));
  return new ApiError(res.status, (body as { error?: string }).error ?? "Something went wrong.");
}

/** The Worker passes UKCP's HTML through untouched; the page reads it here, in the browser. */
async function request<T>(url: string, read: (html: string) => T, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  if (!res.ok) throw await failure(res);
  const html = await res.text();
  try {
    return read(html);
  } catch (error) {
    if (error instanceof ParseError) throw new ApiError(502, UNREADABLE);
    throw error;
  }
}

export const api = {
  search: (query: string) => request(`/api/search${query ? `?${query}` : ""}`, parseResults),
  profile: (slug: string) => request(`/api/therapist/${encodeURIComponent(slug)}`, (html) => parseProfile(html, slug)),
  contact: (id: string) => request(`/api/contact/${encodeURIComponent(id)}`, parseContact, { method: "POST" }),
  place: async (text: string, options: PlaceOptions = {}): Promise<PlaceLookup> => {
    const res = await fetch(`/api/place?${placeQuery(text, options)}`);
    if (!res.ok) throw await failure(res);
    return (await res.json()) as PlaceLookup;
  },
};
