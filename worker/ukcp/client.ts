import { BATCH_SIZE, FLAG_PARAMS, MULTI_PARAMS, SEARCH_MILES, UKCP_ORIGIN, type SearchParams } from "../../shared/query";
const SESSION_TTL_MS = 20 * 60 * 1000;
const TIMEOUT_MS = 10_000;
const TOKEN = /<input[^>]*name="__RequestVerificationToken"[^>]*value="([^"]+)"/;

export type Fetch = (url: string, init?: RequestInit) => Promise<Response>;
type Session = { cookie: string; token: string; fetchedAt: number };

export class UpstreamError extends Error {
  override name = "UpstreamError";
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

/**
 * Talks to UKCP the way its own pages do. One instance lives per Worker isolate and reuses the
 * anti-forgery session; only plain strings are kept between requests, never in-flight promises,
 * because Workers cannot share I/O across requests.
 */
export class UkcpClient {
  #session?: Session;

  constructor(
    private readonly fetchImpl: Fetch,
    private readonly userAgent: string,
    private readonly now: () => number = Date.now,
  ) {}

  /** The search page's HTML, from which the scripts read UKCP's option lists. */
  async searchPage(): Promise<string> {
    return bodyOf(await this.#fetch("/find-a-therapist/"));
  }

  /** A batch of results; `params.page` counts batches of `pageSize`. */
  search(params: SearchParams, pageSize = BATCH_SIZE): Promise<string> {
    return this.#postWithSession("/umbraco/surface/searchsurface/Search", searchForm(params, pageSize));
  }

  contact(id: string): Promise<string> {
    return this.#postWithSession("/Umbraco/Surface/ProfileSurface/ContactDetails", new URLSearchParams({ id }));
  }

  /** Resolves to null when UKCP has no such profile; it redirects unknown slugs to its home page. */
  async profile(slug: string): Promise<string | null> {
    const res = await this.#fetch(`/therapist/${encodeURIComponent(slug)}`, { redirect: "manual" });
    if (res.status === 404 || (res.status >= 300 && res.status < 400)) return null;
    return bodyOf(res);
  }

  async #postWithSession(path: string, form: URLSearchParams): Promise<string> {
    try {
      return await this.#post(path, form, await this.#getSession());
    } catch (error) {
      if (!(error instanceof UpstreamError && error.status === 400)) throw error;
      return this.#post(path, form, await this.#getSession({ renew: true }));
    }
  }

  async #post(path: string, form: URLSearchParams, session: Session): Promise<string> {
    const body = new URLSearchParams(form);
    body.set("__RequestVerificationToken", session.token);
    const res = await this.#fetch(path, {
      method: "POST",
      body,
      headers: {
        Cookie: session.cookie,
        "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
        "X-Requested-With": "XMLHttpRequest",
      },
    });
    return bodyOf(res);
  }

  async #getSession({ renew = false } = {}): Promise<Session> {
    const current = this.#session;
    if (!renew && current && this.now() - current.fetchedAt < SESSION_TTL_MS) return current;
    const res = await this.#fetch("/find-a-therapist/");
    const cookie = res.headers
      .getSetCookie()
      .map((c) => c.split(";")[0])
      .join("; ");
    const token = TOKEN.exec(await bodyOf(res))?.[1];
    if (!token || !cookie) throw new UpstreamError(502, "search page had no anti-forgery token or cookie");
    this.#session = { cookie, token, fetchedAt: this.now() };
    return this.#session;
  }

  #fetch(path: string, init: RequestInit = {}): Promise<Response> {
    const headers = new Headers(init.headers);
    headers.set("User-Agent", this.userAgent);
    return this.fetchImpl(UKCP_ORIGIN + path, { ...init, headers, signal: AbortSignal.timeout(TIMEOUT_MS) });
  }
}

async function bodyOf(res: Response): Promise<string> {
  if (!res.ok) throw new UpstreamError(res.status, `UKCP answered ${res.status}`);
  return res.text();
}

/** UKCP's own form fields for a search, as its page would post them, with a page size its page leaves to the default of 12. */
export function searchForm(params: SearchParams, pageSize = BATCH_SIZE): URLSearchParams {
  const form = new URLSearchParams({
    HelpWith: params.text.HelpWith,
    Location: params.text.Location,
    KeywordFilter: params.text.KeywordFilter,
    Distance: String(SEARCH_MILES),
  });
  for (const name of MULTI_PARAMS) for (const value of params.multi[name]) form.append(name, value);
  for (const name of FLAG_PARAMS) form.set(name, String(params.flags[name]));
  form.set("Pager.CurrentPage", String(params.page));
  form.set("Pager.PageSize", String(pageSize));
  return form;
}
