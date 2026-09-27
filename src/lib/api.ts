import { parseContact } from "@shared/ukcp/parseContact";
import { parseProfile } from "@shared/ukcp/parseProfile";
import { parseResults } from "@shared/ukcp/parseResults";
import { ParseError } from "@shared/ukcp/text";

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

/** The Worker passes UKCP's HTML through untouched; the page reads it here, in the browser. */
async function request<T>(url: string, read: (html: string) => T, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  if (!res.ok) {
    const body: unknown = await res.json().catch(() => ({}));
    throw new ApiError(res.status, (body as { error?: string }).error ?? "Something went wrong.");
  }
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
};
