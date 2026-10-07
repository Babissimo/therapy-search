# Therapy search: an unofficial front end for the UKCP directory

Date: 2026-09-27

## 1. Goal and scope

Rebuild the UK Council for Psychotherapy's [Find a Therapist](https://www.psychotherapy.org.uk/find-a-therapist/) search as a cleaner web page, using UKCP's own backend for every result. Version 1 is parity: the same filters, results and profile information UKCP offers, presented with shadcn/ui components. No new features or UX.

In scope:

- The search form and all its filters (§3.2)
- The results list with paging (§3.3)
- The therapist profile, including the contact details UKCP reveals on request (§3.4)
- A shortlist kept in the visitor's browser (§4.4). It does what UKCP's does (§3.5), and also lets a therapist be added from their result card.

Out of scope for v1:

- The National Register search and the rest of the UKCP site
- The "In-person" and "Remote" toggles beside the location box. They only adjust that box (its placeholder, and making it required for in-person) and never reach the server's filtering (§3.2), so there is nothing to reproduce. The session-type facet does the real filtering and is included.

## 2. Constraints

- **Free to run.** Cloudflare Workers free plan: 100,000 Worker requests a day and 10 ms of CPU per request. With Workers Caching on (§4.2), cached answers and static files count as requests too.
- **Respectful of UKCP.**
  - Cache identical searches (15 minutes, or 6 hours without a location, §4.2), and profiles and their contact details (1 hour), and collapse concurrent identical requests, so repeated traffic never reaches UKCP.
  - Send upstream only what a visitor's action on UKCP would send, with three exceptions: a search asks for 480 results at once where UKCP's page asks for 12, with its nearest 48 beside them when it has a location, or for every result when it has none (map spec §4.4); an opened profile asks for its contact details where UKCP's page waits for a click (§3.4); and a result card asks for its therapist's profile to read the postcode and fee of the office it names, pinning the map there and showing the fee on the card (map spec §3.4). That makes one search POST per uncached batch of results, and one more for an uncached location search's nearest 48, one profile GET and one contact POST per opened profile, and at most one profile GET a month for each therapist and office a card shows, or a week where the profile gives neither postcode nor fee there. Never prefetch or crawl.
  - Identify ourselves in the `User-Agent` with a link to the site, so UKCP can see and contact us.
  - Cap uncached upstream requests per visitor IP (§4.3).
- **Clearly unofficial.** A link beside the site's name opens the about text, which says the site is not affiliated with UKCP, and every profile has a "View on UKCP" link.
- **No health data at rest.** Search terms such as "Trauma" are special-category data under UK GDPR. The Worker logs no query strings or bodies, and cache keys never include the visitor's IP. Cloudflare's request analytics keep every request's URL beside the visitor's IP, so the API takes what a visitor asks in request bodies (§4.2), and the page keeps its route and search after the `#` of its address, which browsers never send. A link with them before the `#` still opens, and has them moved after it as the page loads.

## 3. The UKCP interface

Everything here was observed on 2026-09-27. The site is Umbraco on ASP.NET Core.

### 3.1 Session and anti-forgery

Search and contact requests need an ASP.NET anti-forgery pair:

1. `GET https://www.psychotherapy.org.uk/find-a-therapist/` sets the cookies `.AspNetCore.Antiforgery.*`, `ARRAffinity` and `ARRAffinitySameSite`, and embeds `<input name="__RequestVerificationToken" value="…">` in `form#FindATherapistSearch`.
2. Later POSTs send those cookies and the token as a form field. Without them the server returns `400` with an empty body.

`ARRAffinity` pins the session to one backend instance, so all three cookies travel together. The search page is about 245 KB, so the Worker fetches it as seldom as it can: every isolate shares one session through a KV key, reading the key only when it has no session of its own under 20 minutes old. A session is refreshed after 20 minutes, and on a `400` it is refreshed and the request retried once. A `5xx` or a timeout on a session more than a minute old leaves the isolate to fetch a new session for its next request, since the session's server may be the one failing; sooner than that, the request is the likelier fault. The key holds only the cookies and token, never anything a visitor sent (§2). It is written once per session fetched, a few times an hour in normal running, far inside KV's free 1,000 writes a day; should writes run out, isolates keep sessions of their own until the quota resets.

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
| `Pager.PageSize` | UKCP's UI sends none, for a default of 12 | The server accepts any size, a whole London search of 3,579 included, and falls back to 12 below 1. We send 480, and 48 for a location search's nearest few, or 10,000, more than the whole register of 8,461, for a search without a location (map spec §4.4). |
| `OrderSeed` | Signed 32-bit integer | UKCP's UI sends a per-visitor seed kept in the `TOrderSeed` cookie. It doesn't hold the order steady (see Ordering), so we don't send it. |
| `InPerson`, `Remote` | `true` / `false` | Client-side only: they adjust the location box. The server ignores them. |

Multiple values **AND together**, within a group as well as across groups: `Languages=French&Languages=Spanish` returns only people listed with both. We keep this behaviour for parity.

Ordering: with a location, results are grouped into distance bands and shuffled within each band. Without one, the whole set is shuffled. Either way UKCP reshuffles about once a minute, whatever `OrderSeed` says, and answers an identical request with the same order for about half a minute.

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
| `.tag-list li span` | Up to about 5 issue tags; `li.relevant` marks those a help-with term or ticked box matched, never the keyword |
| `.pagination [data-target-page]` | Page links; we derive paging from total and page size instead |

A zero-result response has no `.results-no` and a "No therapists can be found" notice.

### 3.4 Profile and contact

`GET /therapist/{slug}`, e.g. `/therapist/Maya-Anderson-JJYWLQA5`. The suffix is the tail of a Salesforce contact ID. An unknown slug answers `302` to the home page, which we treat as not found.

| Element | Meaning |
|---|---|
| `.therapist-header h1`, `img.therapist-photo`, `.profile-intro-locations` | Name (its presence marks a profile page), photo, location |
| `.profile-intro-languages` | The languages they work in, comma-separated, on some profiles |
| `.profile-intro-social-media a` | Social media links, repeated for each of the page's layouts. Each `aria-label` names the form field the link was entered in, which need not match the site (a Threads link sits under "Twitter"), so the page names a link by its address |
| `.profile-bio > section` | "About" sections, of which there may be none: `h2` heading, then `p` text (with `<br>` breaks), a `ul` list, or `.accordion-item`s (Special Interests: title plus long text) |
| `.profile-practical-information > section` | Side sections such as Types of sessions and UKCP College: `h3`/`h2` heading and a `ul` |
| `.profile-locations > section` | One office each: `h3` name (a `.fa-star` marks the main address), `address` lines, `a.mini-cta` map link, and the element after the "Cost:" `h4`, which is free text |
| `.therapist-contacts a[href^="mailto:"]` | "Email Therapist" address, shown inline |
| `.therapist-contacts-details` | `data-id` (numeric Umbraco id), `data-nodata`, and `data-email` on the containers that show the email |

Unless `data-nodata="true"`, UKCP's JS adds a "Show Contact Details" button. It sends `POST /Umbraco/Surface/ProfileSurface/ContactDetails` with `__RequestVerificationToken` and `id=<data-id>`, and gets back a fragment with `.therapist-contacts-details-tel`, `-email` and `-web` blocks, each holding one link, then strips the email block from every container without `data-email="true"`. We make the same request as a profile opens, and show the email only where UKCP's page would. The Worker caches each answer as it does profiles (§4.2), so UKCP sees roughly one contact request per therapist an hour from this site, not one per profile view. An unknown id gets an empty page, which is never cached.

### 3.5 Shortlist

UKCP keeps a visitor's shortlist in its own `localStorage`, under `UKCPShortlist`, as `{ "<data-id>": addedAtMs }`, with no copy on the server. Only the profile page's "Shortlist" button adds a therapist, since result cards carry no `data-id`. `/my-shortlist/`, and a strip at the foot of every profile, show the list by posting `shortlistedIds[n]`, newest first, with `__RequestVerificationToken` to `POST /umbraco/surface/shortlistsurface/Retrieve`. The answer holds one `.profile-shortlisting` card per therapist: name, town, tags and profile link, with no photo or summary. The ids are small sequential integers.

## 4. Architecture

One Cloudflare Worker, deployed with Wrangler, serves the static app and a small API that relays UKCP's HTML. The browser parses that HTML with its built-in `DOMParser`. Parsing in the Worker would cost 20–40 ms of CPU on a cold isolate, beyond the free plan's 10 ms (§2), while a browser parses natively and has no such limit. TypeScript throughout.

```
Browser (React + shadcn/ui)  ──/api──▶  Worker (Hono)  ──▶  www.psychotherapy.org.uk
  parse                                   session · validate · cache
```

### 4.1 Front end

Vite, React, Tailwind and shadcn/ui (Radix primitives), with React Router (v8, declarative mode, `HashRouter`, §2) for the two routes (`/` search, `/therapist/:slug` profile) and TanStack Query for fetching and loading states, with retries off so a failure never repeats a request to UKCP.

The search state lives in the page URL, after the `#`, using UKCP's own parameter names (§3.2), with `page` for the page number, as UKCP does, so a search can be bookmarked or shared and maps one-to-one onto a UKCP URL. As on UKCP, checkboxes and the distance slider apply as soon as they change, text fields apply on Enter or the Search button, and any change returns to page 1. Applying a search that nothing has changed asks for nothing and keeps its history entry, so the list keeps its scroll and the map its view.

Results come in an order each browser keeps, since UKCP's own order changes on almost every request (§3.2) and a search can run over days. The browser draws a random 32-bit seed on its first search and keeps it in `localStorage` with no expiry; where storage refuses it, the seed lasts for the page load. A therapist's rank is the 32-bit FNV-1a hash of `<seed>:<slug>`, ties broken by slug. Results sort by UKCP's distance first, so a location search stays nearest first and only people at the same distance move; a card without a distance counts as 0 miles, as UKCP ranks it, so a search without a location is one tie. Within a tie, cards that show more come first, counting one each for a photo and a summary, and rank orders the rest. A rank depends on nothing but the seed and the slug, so a therapist joining or leaving moves nobody else, and the seed never leaves the browser, so cached answers stay shared between visitors. Each batch of results (map spec §4.4) is put in order as it arrives, and a card is read in full only when it is shown (§5).

A switch beside the site's name picks a light, dark or system theme, the last following `prefers-color-scheme`. A light or dark choice is kept in `localStorage`, and an inline script in `index.html` applies it before first paint so a dark page never flashes white.

A profile's header stays at the top of the page or drawer as the visitor reads, with the way out (back to the search, or the drawer's close button), the photo and name, the shortlist's bookmark (§4.4), and every way to reach the therapist: telephone, email, website, social media links and the UKCP profile, each marked by an icon. Where the header is narrow they form one row that scrolls sideways, so the header stays short.

Beneath the header, a profile opened from a search gathers the tags that search asked for, judged as the result cards judge them (map spec §4.4). Those tags are also marked with a tick wherever the profile lists them, languages included.

Then come the sections read at length (My Approach, About Me, Special Interests and What I can help with) and the short rest, languages and the office cards among them. They are told apart by heading rather than length, so each sits in the same place on every profile. On a wide page the long sections take a wide column, under the matching tags, beside a narrow one of the short sections. Where there is less room, as in the drawer, the long sections run full width with the short ones and the office cards two to a line below them, and on a phone everything is one column. A profile without long sections gives the short ones the whole width.

Each office card holds the office's fees and a still map centred on it, the therapist's photo pinned as on the results map. It centres on the office's postcode; failing that, for the main office, on the place UKCP lists the therapist under, as the results map does; otherwise on the last line of its address, usually the town. An office whose address closes with another country, known by any of its English names, and has no UK postcode is looked for within that country (map spec §5.1): by its whole address before the country, then with less of it each time, a line or comma-separated part dropped from the front, taking Nominatim's best answer for the first that is found. Addresses abroad are free text, their streets are often unknown to Nominatim, and the part beside the country is as often a postcode as a town; every try keeps that part, since a lone street or suite could be anywhere in the country. An office that can't be placed has no map. The office's name links to UKCP's map link for it. The map is looked up through the place route (map spec §5), at home under the results map's own cache key, and Leaflet loads only once there is somewhere to show.

Printed, a profile comes out alone and whole, from its page or from the drawer, which then takes the search's place in the page's flow. Buttons, the theme switch, dialogs and the maps stay off paper, each office's address standing for its map. A social link prints its address in place of the site's name, and the UKCP link its address after its words. A search prints its open list without the map, toolbar or tabs, naming its filters in place of the chips, each card kept whole and giving the therapist's UKCP address under their name. Paper takes the light theme whatever the screen's. Tags, initials and the status track's dots keep the ground a printer would otherwise leave out, which parts one tag from the next and carries the light text some have. The page keeps its layout as it prints, though the browser lays it out afresh at the paper's width.

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
| Profile sections | Headed sections with a `Separator` between each; offices as `Card`s |
| Contact details | A header that stays in view, listing each way to reach the therapist by an icon |
| Unofficial notice | The about text, in a drawer opened from beside the site's name |

### 4.2 Worker API

| Route | Body | Cached as | Upstream | Cache |
|---|---|---|---|---|
| `POST /api/search` | UKCP's params | `/api/search?<UKCP params>` | Search POST (§3.2) | 15 minutes; 6 hours without a location |
| `POST /api/therapist` | `slug` | `/api/therapist/:slug` | Profile GET (§3.4) | 1 hour |
| `POST /api/contact` | `id` | `/api/contact/:id` | ContactDetails POST (§3.4) | 1 hour |

Cloudflare's request analytics record each request's full URL with the visitor's IP, network and browser, and keep them for days on every plan, with no setting to stop it; they never record a body. So the browser sends what it asks as a form body, and the Worker has two entrypoints. The default one, which visitors reach, **validates** every parameter against the option lists (including each `HelpWith` term) and the numeric ranges in §3.2, rejecting anything else with `400`, so nothing arbitrary is forwarded. It then **canonicalises** the query (fixed key order, sorted values and `HelpWith` terms, defaults and keys it doesn't forward dropped) and asks the `CachedApi` entrypoint for the canonical URL through `ctx.exports`, a call that stays inside the Worker, so equivalent searches share one cache entry. It answers the browser `no-store`, so nothing searched stays in the browser's cache. `CachedApi` **forwards** the query as a form POST for a batch of 480 results, or for every result when there is no location, with `page` counting batches (map spec §4.4); `/api/search/early` asks for a location search's nearest 48, and refuses a search without one. It returns UKCP's HTML byte for byte, never decoded, since decoding the 8.5 MB of the largest search would take most of a request's 10 ms of CPU, as `text/plain` with `X-Content-Type-Options: nosniff` so it can never render as a page on our origin. The front end parses it (§5). A page loaded from an older deploy may still ask by URL, and is answered `410` with a message to reload. The analytics also record the URL of every `fetch` the Worker makes to another host, with the visitor's network and country. So the two requests whose URL carries what a visitor asked, a place sent to Nominatim and a profile fetched from UKCP, go over a TLS socket (`cloudflare:sockets`) instead, which they don't record: an HTTP/1.1 GET that asks for no compression and for the connection to close, follows no redirect, and fails rather than pass on a response it can't read whole, so none is cached. A `fetch` from a Durable Object, a Queue consumer or an alarm is recorded like any other, a Durable Object's with the visitor's network and country. postcodes.io sits behind Cloudflare, which a socket can't reach, so its lookups go by `fetch` and are recorded in postcodes.io's own account. UKCP's search and contact requests are POSTs to fixed paths, so their URLs hold nothing a visitor asked.

A search without a location is kept for 6 hours. Asking UKCP for all of it is the heaviest request the site makes, and the order a visitor sees comes from the browser (§4.1), so the entry's age decides only how soon a therapist who joins UKCP appears.

The contact route refuses requests that the browser marks as coming from another site (`Sec-Fetch-Site`), so other sites cannot make their visitors' browsers request contact details from UKCP.

Caching uses Workers Caching (`cache.enabled` in the Wrangler config, `Cache-Control: public, max-age=…` on responses). It never caches a POST, so the default entrypoint runs for every API request, and its own cache holds only built files. It keys by entrypoint, path and query and collapses concurrent misses, and it works on `workers.dev`. Entries outlive a deploy (`cache.cross_version_cache`), since the Worker's answers rarely change between deploys: a change that alters them reaches a cached URL only as its entry expires, within an hour for searches and profiles. A route whose answers are kept longer carries a version in its query instead, raised when they change.

Built files under `/assets` are named by a hash of their content, so the Worker serves them marked `immutable` for a year and a returning browser asks for none of them. A name the running deploy lacks, such as a chunk requested by a tab from an older deploy, gets an uncached `404` once the edge no longer holds it, rather than the app's page, which the assets would otherwise send and a `_headers` rule would mark immutable.

### 4.3 Rate limit

Each IP may cause at most 20 uncached upstream requests a minute (IPv6 addresses count per /64, since one visitor usually holds a whole /64), enforced with the Workers rate-limiting binding. The cards' office lookups (map spec §5.3) and a location search's nearest 48 (map spec §4.4) each have an allowance of their own, so neither spends a search's. Past that, the API returns `429` and the UI shows "Too many searches in a short time. Wait a minute and try again." Cached responses are never limited: `CachedApi` counts the request, and runs only on a miss. The default entrypoint passes it the visitor's key in a header, since headers are no part of the cache key, where `ctx.props` would split the cache by visitor.

### 4.4 Shortlist

The shortlist lives in this site's `localStorage`, under `shortlist`, as `{ v: 1, entries: { <slug>: { addedAt, rank, card } } }`, where `card` is the result card (§5) less its distance, which belonged to one search, and `rank`, present once the visitor has moved the therapist, places them in the list. A bookmark on each result card, and in each profile's header, adds or removes a therapist, saying which in a polite live region of its own ("Removed Ruth Okafor from your shortlist."), as a screen reader seldom reads out a focused button's new name. Pressed again after removing someone, a bookmark puts them back with the place and card they had. A profile's bookmark adds the card a search in the page's cache showed for them, and failing that the name, photo and location its header shows, until a search returns them (below). The shortlist is a tab beside the results, in the side bar or atop the list where it leads (map spec §4.3), there before a search too (map spec §4.10), counting who is on it, and lists the copies newest first, so showing it asks the Worker only about each shown card's office (map spec §3.4). A handle beside each card moves a therapist up or down, by dragging or from the keyboard, and the buttons above and below it move them a place at a time for anyone who can't hold a drag; either way a screen reader is told where they are by name and number. A moved therapist is ranked midway between their new neighbours, or at the time of the move when put at the top, so later additions still arrive on top. A therapist removed there stays in place, their portrait faded, until the visitor leaves the tab, so a slip can be undone; others can be moved past them, and they can't be moved until put back. A new search brings the results back. Beside a search, the map shows the shortlist while its tab is open (map spec §4.6). When a search returns a shortlisted therapist, their copy is replaced with the fresh card. Other browser tabs follow through the `storage` event, and where storage is refused the list lasts for the page load.

We keep copies rather than relaying `Retrieve` (§3.5). A relay would cost an uncached upstream request on every view, since each visitor's ids differ; would allow additions only from profiles; would send the list off the visitor's device; and, with sequential ids, would let anyone walk the register through this site. A visitor's UKCP shortlist sits in storage belonging to UKCP's origin, so it cannot be brought across.

The list can be taken away, from a browser someone else may use next or to talk options through with a GP. The tab copies it as plain text, for an email or a note: those still in mind numbered in the visitor's order, each with where the visitor stands, their place and ways of meeting, their UKCP page, which outlasts this site's links, and the visitor's notes; then those set aside. The copy goes by the Clipboard API, or by a selected field where that is missing or refused, and a live region says whether it went. Printed, the tab comes out under the title "Your shortlist", without its controls, anyone removed or a closed "Set aside".

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
  sessionTypes?: string;
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
  languages: string[];
  email?: string;      // inline "Email Therapist" address
  contactId?: string;  // present when UKCP has contact details to give
  emailInContact: boolean;  // a container carries data-email="true"
  social: string[];    // social media links
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

A results page is first read as listings: the `SearchResult` above with each card as `{ slug, distance?, hasPhoto, hasSummary, read }`, enough to order it by (§4.1), whose `read()` gives the `TherapistCard`. A card's other details, which cost the most to read, are read only when it is shown.

Profile sections stay generic because their set varies between profiles; only offices get dedicated fields, since the UI treats them specially. Parsers keep a photo, map or website link only when it is `http(s)`, so markup from upstream can never put a script URL into our page. `Options.groups` mirrors UKCP's filter panel, including the photo and wheelchair flags, so the UI renders what UKCP offers and the Worker validates against the same lists (§3.2).

## 6. Errors

| Condition | Worker | UI |
|---|---|---|
| `400` from UKCP | Refresh session, retry once; then `502` | "UKCP's search isn't responding. Try again, or search on UKCP directly." with a link built from the same parameters |
| UKCP 5xx or no answer within 10 s (25 s for every result of a search without a location) | `502` | Same as above |
| A page without the element its parser starts from (`.results-no` or a notice; `.therapist-header`) | `502`, found by a string search (of a results page's first 8 KB, where UKCP puts either) so it costs no parsing, and never cached | Same as above |
| Markup that has it but no longer parses (for example, cards without a slug) | Passes it on | "UKCP's pages have changed, so this site can't read them yet. Search on UKCP directly." |
| Invalid parameter | `400` naming the parameter | Cannot happen through the UI; the form offers only valid values |
| Rate limit | `429` | §4.3 message |
| Unknown slug (UKCP `302` to its home page) | `404` | "This profile isn't on UKCP any more." with a link back to the results |

## 7. Testing

- **Parser:** unit tests, under jsdom, against HTML fixtures captured from UKCP with personal details replaced by placeholders (names, phones, emails and photo URLs). The capture script is committed so fixtures can be refreshed. Cases: a location search, a search without a location, a zero-result response, an unrecognised location, a profile with inline contact details, a profile with hidden contact details, and the contact-details response.
- **Validation and canonicalisation:** unit tests, including invalid values, out-of-range numbers and equivalent queries that must canonicalise to the same URL.
- **Worker routes:** Vitest calling the Hono app directly with a stub upstream `fetch` and a fake rate limiter. Cases: session refresh after `400`, the `502` paths, the rate-limit response, and the `Cache-Control` and `Content-Type` headers.
- **Front end:** component tests for URL-to-form round-tripping and the profile's contact list, tests of the API client's handling of pages it can't read, plus a manual pass in the browser against the deployed Worker.
- **Contract canary:** a scheduled GitHub Actions workflow runs the parsers, under jsdom, against live UKCP once a day (four requests) and fails if the shapes in §3.3 and §3.4 stop parsing; GitHub's failure email is the alert. When the live option lists differ from `shared/options.json`, it runs the tests and type-check against the new lists and opens a pull request with them, so a change on UKCP's side becomes one merge, which deploys it. This needs the repository setting "Allow GitHub Actions to create and approve pull requests".
