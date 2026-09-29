import { BATCH_SIZE, FLAG_PARAMS, MULTI_PARAMS, SEARCH_MILES, UKCP_ORIGIN, type SearchParams } from "../../shared/query";
const SESSION_TTL_MS = 20 * 60 * 1000;
// A failure this soon after a session's fetch more likely lies with the request than its server.
const DROP_AFTER_MS = 60 * 1000;
const SESSION_KEY = "session";
const TIMEOUT_MS = 10_000;
const TOKEN = /<input[^>]*name="__RequestVerificationToken"[^>]*value="([^"]+)"/;

export type Fetch = (url: string, init?: RequestInit) => Promise<Response>;
type Session = { cookie: string; token: string; fetchedAt: number };

/** Where isolates share the session, so each need not fetch UKCP's 245 KB search page for its own: the site's KV namespace. */
export type SessionStore = {
  get(key: string): Promise<string | null>;
  put(key: string, value: string, options: { expirationTtl: number }): Promise<void>;
};

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
 * anti-forgery session, taking it from the store when another isolate has one; only plain strings
 * are kept between requests, never in-flight promises, because Workers cannot share I/O across requests.
 */
export class UkcpClient {
  #session?: Session;
  #dropped?: string;
  readonly #store?: SessionStore;
  readonly #now: () => number;

  constructor(
    private readonly fetchImpl: Fetch,
    private readonly userAgent: string,
    { store, now = Date.now }: { store?: SessionStore; now?: () => number } = {},
  ) {
    this.#store = store;
    this.#now = now;
  }

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
    let session: Session | undefined;
    try {
      session = await this.#getSession();
      return await this.#post(path, form, session);
    } catch (error) {
      if (error instanceof UpstreamError && error.status === 400) return this.#post(path, form, await this.#getSession({ renew: true }));
      // Its ARRAffinity cookie ties a session to one of UKCP's servers, so a failing server's session is not used again.
      if (session && serverFailed(error) && this.#now() - session.fetchedAt >= DROP_AFTER_MS) this.#dropped = session.token;
      throw error;
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
    if (!renew) {
      const fresh = (session?: Session) =>
        session && session.token !== this.#dropped && this.#now() - session.fetchedAt < SESSION_TTL_MS ? session : undefined;
      const current = fresh(this.#session) ?? fresh(await this.#sharedSession());
      if (current) return (this.#session = current);
    }
    const res = await this.#fetch("/find-a-therapist/");
    const cookie = res.headers
      .getSetCookie()
      .map((c) => c.split(";")[0])
      .join("; ");
    const token = TOKEN.exec(await bodyOf(res))?.[1];
    if (!token || !cookie) throw new UpstreamError(502, "search page had no anti-forgery token or cookie");
    this.#session = { cookie, token, fetchedAt: this.#now() };
    await this.#shareSession(this.#session);
    return this.#session;
  }

  // The store only saves fetches, so when it fails the isolate fetches and keeps a session of its own.
  async #sharedSession(): Promise<Session | undefined> {
    try {
      const value = await this.#store?.get(SESSION_KEY);
      return value ? (JSON.parse(value) as Session) : undefined;
    } catch {
      return undefined;
    }
  }

  async #shareSession(session: Session): Promise<void> {
    try {
      await this.#store?.put(SESSION_KEY, JSON.stringify(session), { expirationTtl: SESSION_TTL_MS / 1000 });
    } catch {}
  }

  #fetch(path: string, init: RequestInit = {}): Promise<Response> {
    const headers = new Headers(init.headers);
    headers.set("User-Agent", this.userAgent);
    return this.fetchImpl(UKCP_ORIGIN + path, { ...init, headers, signal: AbortSignal.timeout(TIMEOUT_MS) });
  }
}

/** What a failing server gives, as against a rejected token. */
function serverFailed(error: unknown): boolean {
  return (error instanceof UpstreamError && error.status >= 500) || (error as { name?: unknown } | null)?.name === "TimeoutError";
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
