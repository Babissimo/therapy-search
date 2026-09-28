# Therapy search: an unofficial front end for the UKCP directory

Date: 2026-09-27

## 1. Goal and scope

Rebuild the UK Council for Psychotherapy's [Find a Therapist](https://www.psychotherapy.org.uk/find-a-therapist/) search as a cleaner web page, using UKCP's own backend for every result. Version 1 is parity: the same filters, results and profile information UKCP offers, presented with shadcn/ui components. No new features or UX.

In scope:

- The search form and all its filters (§3.2)
- The results list with paging (§3.3)
- The therapist profile, including click-to-reveal contact details (§3.4)

Out of scope for v1:

- UKCP's shortlist ("My Shortlist"), the National Register search and the rest of the UKCP site
- The "In-person" and "Remote" toggles beside the location box. They only adjust that box (its placeholder, and making it required for in-person) and never reach the server's filtering (§3.2), so there is nothing to reproduce. The session-type facet does the real filtering and is included.

## 2. Constraints

- **Free to run.** Cloudflare Workers free plan: 100,000 Worker requests a day and 10 ms of CPU per request, and static assets are free and unlimited.
- **Respectful of UKCP.**
  - Cache identical searches (15 minutes) and profiles (1 hour), and collapse concurrent identical requests, so repeated traffic never reaches UKCP.
  - Send upstream only what a visitor's action on UKCP would send: one search POST per uncached search, one profile GET per opened profile, one contact POST per click. Never prefetch or crawl.
  - Identify ourselves in the `User-Agent` with a link to the site's about page, so UKCP can see and contact us.
  - Cap uncached upstream requests per visitor IP (§4.3).
- **Clearly unofficial.** A persistent notice that the site is not affiliated with UKCP, and a "View on UKCP" link on every profile.
- **No health data at rest.** Search terms such as "Trauma" are special-category data under UK GDPR. The Worker logs no query strings or bodies, and cache keys never include the visitor's IP.

## 3. The UKCP interface

Everything here was observed on 2026-09-27. The site is Umbraco on ASP.NET Core.

### 3.1 Session and anti-forgery

Search and contact requests need an ASP.NET anti-forgery pair:

1. `GET https://www.psychotherapy.org.uk/find-a-therapist/` sets the cookies `.AspNetCore.Antiforgery.*`, `ARRAffinity` and `ARRAffinitySameSite`, and embeds `<input name="__RequestVerificationToken" value="…">` in `form#FindATherapistSearch`.
2. Later POSTs send those cookies and the token as a form field. Without them the server returns `400` with an empty body.

`ARRAffinity` pins the session to one backend instance, so all three cookies travel together. The Worker keeps one session per isolate, refreshes it after 20 minutes, and on a `400` refreshes and retries once.

### 3.2 Search request

`POST /umbraco/surface/searchsurface/Search`, `application/x-www-form-urlencoded`. Repeated keys carry multiple values.

| Field | Values | Semantics |
|---|---|---|
| `HelpWith` | Comma-separated terms from a 134-item list (issues and therapy types) | Typeahead in the top bar. `HelpWith=anxiety` returns the same set as `HelpWithAdvanced=Anxiety`, and several terms AND together like the filters below. |
| `Location` | Free text: town, postcode, area | Geocoded by UKCP. An unrecognised place falls back to "United Kingdom" silently; the response's "Location searched" line is the only signal. |
| `Distance` | Integer 1–30 miles, default 10 | Radius around `Location` |
| `LocationSearchOutsideUK` | `true` / `false` | Allows non-UK locations |
| `KeywordFilter` | Free text | Narrows by names and profile text |
| `TypesOfSession` | 5 values, e.g. `Online Therapy`, `Face to Face - Long Term` | The real in-person / remote filter |
| `HelpWithAdvanced` | 59 issues | |
| `WorksWith` | 7 values, e.g. `Couples` | |
| `TypesOfTherapy` | 75 modalities | |
| `Languages` | 86 languages | |
| `Colleges` | 11 UKCP colleges | |
| `OnlyProfilesWithPhotos`, `OnlyWheelchairAccessible` | `true` / `false` | |
| `Pager.CurrentPage` | 1-based | |
| `Pager.PageSize` | UKCP's UI sends 12 | The server accepts at least 300. We send 12 for parity. |
| `OrderSeed` | Signed 32-bit integer | Seeds the random order. UKCP stores a per-visitor seed in the `TOrderSeed` cookie. |
| `InPerson`, `Remote` | `true` / `false` | Client-side only: they adjust the location box. The server ignores them. |

Multiple values **AND together**, within a group as well as across groups: `Languages=French&Languages=Spanish` returns only people listed with both. We keep this behaviour for parity.

Ordering: with a location, results are grouped into distance bands and shuffled within each band. Without one, the whole set is shuffled by `OrderSeed`.

The authoritative option lists are the checkbox values in `form#FindATherapistSearch` and the `li` items of `.find-a-therapist-issues-container`. They change rarely, and fetching them live would add a request to UKCP for every visit, so a script extracts them into the committed `shared/options.json`. The front end and the Worker both import that file, and the daily canary (§7) proposes a refresh when the live lists differ from it.

### 3.3 Search response

An HTML fragment that UKCP injects into `#therapist-results-target`. Parse targets:

| Element | Meaning |
|---|---|
| `.results-no` | "1-12 of 257 results" → from, to, total |
| `.results-location strong` | Resolved location, e.g. "Brighton, Brighton and Hove, UK" (present only with a location) |
| `.fat-search-alert h6` | Notices: too many results, no results, how ordering works |
| `.profile-listing > a[href^="therapist/"]` | One card per therapist; the href gives the profile slug |
| `img.profile-photo` / `.profile-photo-placeholder span` | Photo URL, or initials |
| `h2` | Name |
| `.profile-listing-locations strong` + trailing text | Town and postcode, and "(0 miles from Brighton)" when searching by location |
| `.profile-listing-contact-session-type` | Phone in `strong`, then session-type text ("In-person & Remote") |
| `p` | Summary, already truncated by UKCP |
| `.tag-list li span` | Up to about 5 issue tags |
| `.pagination [data-target-page]` | Page links; we derive paging from total and page size instead |

A zero-result response has no `.results-no` and a "No therapists can be found" notice.

### 3.4 Profile and contact

`GET /therapist/{slug}`, e.g. `/therapist/Maya-Anderson-JJYWLQA5`. The suffix is the tail of a Salesforce contact ID. An unknown slug answers `302` to the home page, which we treat as not found.

| Element | Meaning |
|---|---|
| `.therapist-header h1`, `img.therapist-photo`, `.profile-intro-locations` | Name (its presence marks a profile page), photo, location |
| `.profile-bio > section` | "About" sections, of which there may be none: `h2` heading, then `p` text (with `<br>` breaks), a `ul` list, or `.accordion-item`s (Special Interests: title plus long text) |
| `.profile-practical-information > section` | Side sections such as Types of sessions and UKCP College: `h3`/`h2` heading and a `ul` |
| `.profile-locations > section` | One office each: `h3` name (a `.fa-star` marks the main address), `address` lines, `a.mini-cta` map link, and the element after the "Cost:" `h4`, which is free text |
| `.therapist-contacts a[href^="mailto:"]` | "Email Therapist" address, shown inline |
| `.therapist-contacts-details` | `data-id` (numeric Umbraco id) and `data-nodata` |

Unless `data-nodata="true"`, UKCP's JS adds a "Show Contact Details" button. It sends `POST /Umbraco/Surface/ProfileSurface/ContactDetails` with `__RequestVerificationToken` and `id=<data-id>`, and gets back a fragment with `.therapist-contacts-details-tel`, `-email` and `-web` blocks, each holding one link. We reproduce this with one upstream call per click, uncached, so UKCP's view of contact requests stays accurate.

## 4. Architecture

One Cloudflare Worker, deployed with Wrangler, serves the static app and a small API that relays UKCP's HTML. The browser parses that HTML with its built-in `DOMParser`. Parsing in the Worker would cost 20–40 ms of CPU on a cold isolate, beyond the free plan's 10 ms (§2), while a browser parses natively and has no such limit. TypeScript throughout.

```
Browser (React + shadcn/ui)  ──/api──▶  Worker (Hono)  ──▶  www.psychotherapy.org.uk
  parse                                   session · validate · cache
```

### 4.1 Front end

Vite, React, Tailwind and shadcn/ui (Radix primitives), with React Router (v8, declarative mode) for the three routes (`/` search, `/therapist/:slug` profile, `/about`) and TanStack Query for fetching and loading states, with retries off so a failure never repeats a request to UKCP.

The search state lives in the page URL using UKCP's own parameter names (§3.2), with `page` for the page number, as UKCP does, so a search can be bookmarked or shared and maps one-to-one onto a UKCP URL. As on UKCP, checkboxes and the distance slider apply as soon as they change, text fields apply on Enter or the Search button, and any change returns to page 1. The visitor's `OrderSeed` is drawn once from a pool of 64 values and kept in `localStorage`, so the order stays stable while paging and shuffled searches still share cache entries. It is sent only when there is no location, since location searches are ordered by distance band.

A switch in the header picks a light, dark or system theme, the last following `prefers-color-scheme`. A light or dark choice is kept in `localStorage`, and an inline script in `index.html` applies it before first paint so a dark page never flashes white.

| UKCP element | shadcn/ui |
|---|---|
| "I want help with" typeahead, multiple terms | `Popover` + `Command` combobox, choices shown as `Badge`s |
| Location, keyword | `Input` |
| Distance 1–30 | `Slider` with a value label |
| Outside UK, photos only, wheelchair accessible | `Checkbox` |
| Filter groups, each with a "?" help note | `Accordion` of `Checkbox` lists, open where a box is ticked; `Tooltip` for the help text; a filter `Input` inside Type of Therapy, Languages and Colleges, as UKCP has |
| Clear all filters | `Button` (ghost) |
| Filter sidebar on narrow screens | `Sheet` |
| Result count, resolved location, notices | Text line and `Alert` |
| Result card | `Card` with `Avatar` (photo or initials) and `Badge` tags |
| Paging | `Pagination` |
| Loading | `Skeleton` cards |
| Profile sections | `Card`s with `Separator`s |
| Show contact details | `Button` that swaps in the returned details |
| Unofficial notice | Footer text and an about page |

### 4.2 Worker API

| Route | Upstream | Cache |
|---|---|---|
| `GET /api/search?<UKCP params>` | Search POST (§3.2) | 15 minutes |
| `GET /api/therapist/:slug` | Profile GET (§3.4) | 1 hour |
| `POST /api/contact/:id` | ContactDetails POST | None |

Search is a GET on our side so the response can be cached by URL. The Worker **validates** every parameter against the option lists (including each `HelpWith` term) and the numeric ranges in §3.2, with `OrderSeed` limited to the pool of 64 (§4.1), rejecting anything else with `400`, so nothing arbitrary is forwarded. It then **canonicalises** the query (fixed key order, sorted values and `HelpWith` terms, defaults and redundant `OrderSeed` dropped) and redirects to the canonical URL when it differs, so equivalent searches share one cache entry. It **forwards** the query as a form POST and returns UKCP's HTML unchanged, as `text/plain` with `X-Content-Type-Options: nosniff` so it can never render as a page on our origin. The front end parses it (§5).

The contact route answers only requests from the site's own pages (a matching `Origin`), so other sites cannot make their visitors' browsers request contact details from UKCP.

Caching uses Workers Caching (`cache.enabled` in the Wrangler config, `Cache-Control: public, max-age=…` on responses). It keys by path and query and collapses concurrent misses, and it works on `workers.dev`.

### 4.3 Rate limit

Each IP may cause at most 20 uncached upstream requests a minute (IPv6 addresses count per /64, since one visitor usually holds a whole /64), enforced with the Workers rate-limiting binding. Past that, the API returns `429` and the UI shows "Too many searches in a short time. Wait a minute and try again." Cached responses are never limited.

## 5. Data shapes

The parsers in `shared/ukcp` turn UKCP's HTML into these shapes. They use only the standard DOM, so the same code runs in the browser and, through jsdom, in the Node scripts and tests.

```ts
type SearchResult = {
  total: number; from: number; to: number;
  locationSearched?: string;
  notices: string[];
  therapists: TherapistCard[];
};

type TherapistCard = {
  slug: string; name: string; initials: string; photoUrl?: string;
  location?: string; distance?: string;
  phone?: string; sessionTypes?: string;
  summary?: string; tags: string[];
};

type ProfileSection = {
  heading: string;
  paragraphs: string[];
  items: string[];
  details: { title: string; text: string }[];
};

type Profile = {
  slug: string; name: string; initials: string; photoUrl?: string; location?: string;
  email?: string;      // inline "Email Therapist" address
  contactId?: string;  // present when contact details can be revealed
  about: ProfileSection[];
  practical: ProfileSection[];
  offices: { name: string; isMain: boolean; address: string[]; mapUrl?: string; cost?: string }[];
};

type ContactDetails = { phone?: string; email?: string; website?: string };

type Options = {
  helpWith: string[];
  groups: { label: string; help?: string; fields: { name: string; value: string; label: string }[] }[];
};
```

Profile sections stay generic because their set varies between profiles; only offices get dedicated fields, since the UI treats them specially. Parsers keep a photo, map or website link only when it is `http(s)`, so markup from upstream can never put a script URL into our page. `Options.groups` mirrors UKCP's filter panel, including the photo and wheelchair flags, so the UI renders what UKCP offers and the Worker validates against the same lists (§3.2).

## 6. Errors

| Condition | Worker | UI |
|---|---|---|
| `400` from UKCP | Refresh session, retry once; then `502` | "UKCP's search isn't responding. Try again, or search on UKCP directly." with a link built from the same parameters |
| UKCP 5xx or no answer within 10 s | `502` | Same as above |
| A page without the element its parser starts from (`.results-no` or a notice; `.therapist-header`) | `502`, found by a string search so it costs no parsing, and never cached | Same as above |
| Markup that has it but no longer parses (for example, cards without a slug) | Passes it on | "UKCP's pages have changed, so this site can't read them yet. Search on UKCP directly." |
| Invalid parameter | `400` naming the parameter | Cannot happen through the UI; the form offers only valid values |
| Rate limit | `429` | §4.3 message |
| Unknown slug (UKCP `302` to its home page) | `404` | "This profile isn't on UKCP any more." with a link back to the results |

## 7. Testing

- **Parser:** unit tests, under jsdom, against HTML fixtures captured from UKCP with personal details replaced by placeholders (names, phones, emails and photo URLs). The capture script is committed so fixtures can be refreshed. Cases: a location search, a search without a location, a zero-result response, an unrecognised location, a profile with inline contact details, a profile with hidden contact details, and the contact-details response.
- **Validation and canonicalisation:** unit tests, including invalid values, out-of-range numbers and equivalent queries that must canonicalise to the same URL.
- **Worker routes:** Vitest calling the Hono app directly with a stub upstream `fetch` and a fake rate limiter. Cases: session refresh after `400`, the `502` paths, the rate-limit response, and the `Cache-Control` and `Content-Type` headers.
- **Front end:** component tests for URL-to-form round-tripping and the contact reveal, tests of the API client's handling of pages it can't read, plus a manual pass in the browser against the deployed Worker.
- **Contract canary:** a scheduled GitHub Actions workflow runs the parsers, under jsdom, against live UKCP once a day (four requests) and fails if the shapes in §3.3 and §3.4 stop parsing; GitHub's failure email is the alert. When the live option lists differ from `shared/options.json`, it runs the tests and type-check against the new lists and opens a pull request with them, so a change on UKCP's side becomes one merge, which deploys it. This needs the repository setting "Allow GitHub Actions to create and approve pull requests".
