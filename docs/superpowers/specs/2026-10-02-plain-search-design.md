# Therapy search: a plain search that works without the app

Date: 2026-10-02

## 1. Goal and scope

Give everyone who can't run the app a search that works. The accessibility review of 1 October found the page blank without JavaScript (H4) and broken or blank in browsers older than the build's floor (§5.2), such as Safari on an iPad that can't update past iPadOS 15. `index.html` now shows a plain fallback with the help-now line and a link to UKCP's own directory, but nothing on this site searches without the app. Its structural fix, B2, is a plain form the Worker answers with server-rendered pages.

In scope:

- A plain search at `/plain`: a form, and results a page at a time (§3)
- A plain profile with contact details, since UKCP's own profile page shows them only through its script (§4)
- A way in from `index.html` without JavaScript, when the app is late, and for browsers below the floor (§5)
- The accessibility statement and README (§6)

Out of scope:

- The map, the shortlist, notes and copying the list, which need the app.
- Keeping one order of results per browser, which needs storage, and the app's preference for cards with a photo and summary (§3.3).
- Fees and office pins on result cards, which each cost an office lookup; the profile gives every office's fee (§4).
- Photos, Use my location, social links and the help-with typeahead.
- The filter-first prompt of filter-before-searching §4.2: the plain form sets its filters out on the same page as the place.
- Carrying a plain search into the app. The app routes in the `#` fragment, so a link into it would have to be written by script.

## 2. Constraints

- **Nothing searched reaches a URL.** Cloudflare's request analytics keep each request's full URL beside the visitor's IP. Every plain page is reached at `/plain` or `/plain/therapist`, and the search, page number and profile asked for travel in POST bodies, as the API's do (#93). There is no Post/Redirect/Get, which would put them back in a URL. The Worker reaches UKCP and the geocoders as now (#109).
- **One way to UKCP.** The plain routes ask the cached entrypoint by the canonical URLs the app's routes use, so they share its cache entries, its rate limits (`UPSTREAM_LIMIT` for searches and profiles, nothing new) and the body limit. Nothing is asked of UKCP that a visitor didn't ask for, and Nominatim isn't asked at all: UKCP places the typed text itself.
- **UKCP's text is untrusted.** Every value from UKCP or the visitor goes through Hono's `html` template, which escapes it, links are built only from checked slugs, numbers and http(s) URLs, and each page's Content-Security-Policy allows no script at all.
- **Old browsers read it.** HTML any browser renders, with `details` the newest element. CSS without custom properties, `oklch`, `color-mix`, `@property`, nesting or `:has`, inline in each page. No script.
- **The Worker is on the free plan,** with 10 ms of CPU a request; a Worker that keeps going over has its requests cut off (error 1102). It reads a results page by pattern, as `worker/ukcp/offices.ts` reads offices, since it has no DOM parser, and reads a card whole only once it is shown. Near a place it reads every card's slug and distance in the batch of 480 to put them in order (§3.3), about 3 ms a page. Online it reads only as far as the page shown, keeping UKCP's order, since ordering a whole set of thousands would take about 14 ms a page. A first online page then costs under 1 ms besides decoding the body (2 to 6 ms for a set of 5,200), but a deep page of such a set reads nearly all of it, 8 to 11 ms, and goes over: only someone paging hundreds of results into the broadest online searches meets that.
- **The app stays as it is** for browsers that can run it.

## 3. The plain search

### 3.1 Routes

- `GET /plain`: the empty form.
- `POST /plain`: a page of results, or the form saying what's wrong.
- `POST /plain/therapist`: a profile (§4).

Each answers `text/html; charset=utf-8` with `Cache-Control: private, no-cache`, so Back reaches a page of results without sending its form again while nothing is kept at the edge, and a CSP of `default-src 'none'` with inline styles. An address under `/plain` with a trailing slash leads to the one without it, spelt as sent, by a 301, or for a form by a 307, which the browser follows with the same body, so the body limit and the same-site check apply where it lands; the query, which nothing here reads, is left behind. Redirects are marked `private, no-cache` as the pages are. Other paths under `/plain` answer a plain "page not found". `run_worker_first` in `wrangler.jsonc` gains `/plain` and `/plain/*`.

### 3.2 The form

1. "Where to meet": Near me (chosen at first) or Online or by phone, as radio buttons.
2. "Town or postcode", which only Near me uses.
3. "Keyword search", which UKCP looks for in names and profile text.
4. Search.
5. "Filters": every group the app's filter panel shows, with its name and plain-words help, from `shared/filterGroups.ts`. Each group is a `details` holding a `fieldset` of checkboxes, open when something in it is ticked, as the app's accordion is. Groups with headings of our own (`shared/sections.ts`) set them out as nested fieldsets. Groups whose ticks UKCP ANDs carry the app's line saying so.
6. Search again.

Its fields are named after UKCP's parameters, so `readParams` reads the form as it reads the API's bodies. Online uses the same groups as Near me; the face-to-face session types, home visits and wheelchair access don't apply there, as the radio button's hint says.

To share the app's names and help, the filter groups, the online rules (`onlineSearch`, `narrowsOnline`) and `locationFellBack` move from `src/search` to `shared/`, unchanged.

### 3.3 Searching

- **Near me** needs a place, or says "Type a town or postcode to search." beside the box.
- **Online** asks what the app's online view asks (`onlineSearch`), and needs a filter besides type of session by the app's rule (`narrowsOnline`), or says so beside the Filters heading.
- The Worker asks the cached entrypoint for the batch holding the page: batches of 480 near a place and the whole set online, under the URLs the app asks for them by. A page shows 12 results, as the app's Load more does, and More results is a button whose form carries the search, its seed and how many have been shown.
- Near a place, results come in the app's order (`shared/order.ts`): nearest first, by UKCP's miles, and among those at the same distance by the rank a seed gives each slug. A plain page shows no photo and reads a card whole only once it is shown, so the app's preference for cards with a photo and summary, which would mean reading every card of a batch, is left out. A search's first page draws its seed at random, and More results and the results page's own search form carry it back in their bodies, so a search keeps one order across its pages and as it is refined, while a search begun afresh draws another. UKCP reshuffles those at the same distance about once a minute, and the cache keeps a batch at most 15 minutes, so the Worker orders each batch before taking a page from it, and a batch fetched again pages as it did before.
- Online, results come in UKCP's shuffled order, since ordering a whole set would take more CPU than a request has (§2). The cache keeps the set at most 6 hours, so its pages repeat or skip someone only when that entry expires, or the cache drops it, while someone is paging through. Its forms carry the seed all the same, so a search changed to Near me keeps it.
- UKCP chooses each batch near a place by distance, so a batch fetched again holds the same therapists, except where several share the distance at which it ends. Those can move between it and the next batch when the two come from different shuffles, to be shown twice or not at all. Only a search of more than 480 results has such an end, and only a visitor paging past it meets it.
- When UKCP didn't recognise the place and searched the whole UK instead, the page says so beside the box ("UKCP didn't recognise "Brightn". Try a town or a postcode.") and shows no results, which would come from anywhere.
- Too many searches and UKCP not responding give the Worker's own messages at the top of the form. A results page the Worker can't read says so and points to UKCP.

An error's page title begins "Error:", a box at the top of the main content links to the field concerned, and the message sits beside the field, tied to it by `aria-describedby`.

### 3.4 Pages

- **Results.** A heading in the app's words for what was found ("441 therapists near Bristol", "No therapists working online or by phone"), then which ones show ("Showing 13 to 24, nearest first."). Each therapist has their name as a heading, their office's town and distance ("Bristol BS8 (0.6 miles away)"), how they meet when near a place, the card's summary, and a button for their profile. With none found and filters set, "Remove a filter to see more." Beneath the list, More results, then "Change your search" with the form filled in.
- **Every page** has `lang="en-GB"`, a title naming the page before the site's name, a header linking to a new search, `main` with an `h1`, and a footer with the help-now line, UKCP's own directory, the full search and the report-a-problem link, in that order on every page. The help-now line has `HelpNow`'s words and numbers; a test holds the two together, as it does `index.html`'s copy.
- **Style.** Close to the fallback page: one column 36rem wide, the app's slate teal and warm white in plain hex, a dark scheme by `prefers-color-scheme`, real borders and outlines that forced colours keep, a 3 px focus outline, and nothing that scrolls sideways at 320 px or at 400% zoom.

## 4. The plain profile

UKCP's own profile page leaves its contact details empty until its script asks for them (checked with curl against a live profile on 2 October 2026), so a profile there would give a visitor without the app no way to get in touch. The results link to a plain profile instead.

- Each result's button posts its slug to `/plain/therapist` in a form with `target="_blank"`, so the results stay in their tab; the button's name says it opens a new tab, as the app's `NEW_TAB` does.
- The Worker asks the cached entrypoint for the profile and, when it gives a contact id, its contact details, as the app's profile does when it opens. Like `/api/contact`, the route refuses a request another site's page makes.
- The page gives the name, place and languages; telephone, email and website, and "View on UKCP" (new tab); the profile's sections in UKCP's order, with their headings, paragraphs, lists and details; and each office with its address and fees.
- The Worker reads the profile by pattern. The readers are tested against the fixtures, and against what the browser's parsers (`parseResults`, `parseProfile`, `parseContact`) read from them.
- A profile UKCP no longer has says "This profile isn't on UKCP any more."

## 5. The way in

### 5.1 From the fallback page

`index.html`'s page offers the plain search where the app can't run:

- With JavaScript off, at once, in its `noscript` note.
- When the app is late, in the note that shows after 10 seconds.
- In a browser below the floor, at once, in place of "Loading the search".

The page the error boundary shows when drawing the app fails offers it too.

### 5.2 Telling older browsers apart

The floor, from the built bundle (`npm run build`, 2 October 2026):

- **Script.** A class static block (in Radix) needs Safari 16.4, Chrome 94 and Firefox 93; `toSorted` and `toSpliced` need Chrome 110 and Firefox 115.
- **Styles.** `oklch` needs Chrome 111 and Firefox 113, and media query ranges Safari 16.4. Where `@property` is missing (before Safari 16.4 and Firefox 128), Tailwind sets its variables' starting values on every element instead, so Firefox 115 to 127 draw the page as newer ones do. `:has` (Firefox 121) only marks the theme switch's focus and choice.

So the app needs Chrome 111, Safari 16.4 or Firefox 115. A classic script at the top of `index.html`, written for any browser, tests `CSS.supports("color", "oklch(0 0 0)")`, `matchMedia("(width >= 0px)")` and `[].toSorted`, which together arrive in exactly those versions. Below them it marks the page, which shows the plain search's offer, and `src/main.tsx` doesn't start the app. Older Safari can't parse the bundle at all, and older Chrome would draw it without its colours; the mark offers them the plain search at once rather than after the late note's wait.

The page offers the plain search rather than going to it, so the visitor sees why, and a link carrying a `#` route isn't silently dropped.

## 6. Statement and README

- The README says the Worker also serves the plain search.
- The statement's list of what a visitor can do gains the plain search, and its known problem for older browsers says they get the plain search, without the map or shortlist.

## 7. Testing

- Worker: the form, a search near a place and online, More results, paging through a batch UKCP reshuffles between pages, each error, escaping (a therapist named `<script>`), the cache and rate limit path, nothing searched in a URL the cache is asked by, the cross-site refusal, an address with a trailing slash, and the profile with and without contact details.
- Readers: the fixtures read as the browser's parsers read them.
- The help-now line and the site's name and links held to the app's.
- `index.html`: the offers, and the gate marking a browser that lacks either feature.
- By hand in Chrome with JavaScript off: 320 × 568 and 1280 × 800, light and dark, axe, and the app with JavaScript on.

## 8. Delivery

Two PRs. §3, §4 and the README first, with this spec, the move into `shared/` and the Worker's readers each a commit of its own; §5 and the statement stacked on it.
