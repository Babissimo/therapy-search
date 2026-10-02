# Therapy search: a map of results

Date: 2026-09-27

## 1. Goal and scope

Make the search page a map with the results beside it, so a visitor can see where therapists are and judge how easy each would be to reach. It builds on the parity front end described in `2026-09-27-ukcp-search-parity-design.md`, cited here as "parity §n".

In scope:

- A map-centred search page: the results in a collapsible panel beside it on wide screens, with the search and filters over the map, and on phones and short windows the list first, the map a press away (§4.1–4.5)
- One list of results that grows with "Load more" and that the map mirrors (§4.4)
- Therapist pins, clusters, the search's centre and zoom (§4.6–4.7)
- Pins at the postcode of the office a card shows, and that office's fee on the card, read from the therapist's profile (§3.4)
- A notice when UKCP doesn't recognise the typed location (§4.9)
- A prompt in place of a search of everyone (§4.10), and profiles in a drawer over the search (§4.11)
- Place- and office-lookup routes on the Worker (§5)

Out of scope:

- Mapping every result at once. The results grow a page at a time (§4.4)
- Searching the area in view, since UKCP searches from a typed location
- The visitor's own position (a "locate me" control) and travel times
- A therapist's other offices on the results map. Each office on a profile has its own small map (parity §4.1)

## 2. Constraints

The parity constraints still hold (parity §2). In addition:

- **Pins use what the result card shows, sharpened from the profile.** UKCP publishes no coordinates. A card has one free-text location, seen live as ` BN31FG`, `BRIGHTON BN3`, `Brighton ` or `Brighton BN`, and profile map links are Google text searches. The map geocodes that text at the precision the therapist gave, full postcodes included, and moves a pin to the office's postcode where the profile gives one (§3.4).
- **Respectful of the geocoders.** postcodes.io and Nominatim are free services. Each distinct string is looked up once and cached for every visitor (§5.1), requests carry the Worker's existing `User-Agent`, and uncached lookups are capped per visitor (§5.3). Nominatim's policy (at most one request a second, results cached, data attributed) is met by using it only for search centres, outside-UK searches (§3.3) and profile offices abroad (parity §4.1).
- **Third parties never see search terms.** The browser's only third-party requests are map tiles, which reveal the area in view. The default referrer policy sends the tile server our origin alone, never the page URL with its filters, and must stay that way. Place lookups go through the Worker, so the geocoders never see a visitor's IP.
- **Free to run.** CARTO's raster tiles need a key, free for non-commercial use up to 5 million tile requests a month. Each page of results adds at most 37 Worker requests (§5.1), well inside the free plan's daily allowance at this site's scale.

## 3. Where a pin comes from

### 3.1 Reading the location text

`shared/location.ts` trims the text, collapses its spaces, upper-cases it and classifies it:

| The text has | Kind | Example |
|---|---|---|
| A full UK postcode, space optional | `postcode` | ` BN31FG` → `BN3 1FG` |
| An outcode as its last word | `outcode` | `BRIGHTON BN3` → `BN3` |
| Other words, once a trailing one- or two-letter postcode area is dropped | `place` | `Brighton BN` → `BRIGHTON` |
| Nothing else | too general | ` BN` |

A lookup that finds nothing falls back one row: an unknown postcode (a retired one, say) tries its outcode, and an unknown outcode tries any remaining words as a place.

### 3.2 Choosing among candidates

A postcode or outcode has one answer. A place name can match several places ("Brighton" is also a hamlet in Cornwall), so its lookup returns up to ten candidates and the browser chooses:

- With a search centre, the candidate nearest to it.
- Without one, the most settled type, in the order city, town, other settlement, suburban area, village, hamlet, then the geocoder's own order.

Choosing in the browser keeps each string's cached answer independent of the search it appeared in.

A place-name pin further from the centre than twice the 30 miles searched (§4.5) plus 5 miles is treated as unplaced (§4.8) rather than shown where the therapist probably isn't. Postcodes and outcodes are unambiguous, so they are shown wherever they fall.

### 3.3 The search centre

The centre is UKCP's "Location searched" (parity §3.3) rather than the typed text, since that is the point UKCP measured distances from. A place name there goes to Nominatim, whose ranking by prominence puts Brighton the city first; a postcode or outcode goes to postcodes.io as in §3.1. There is no centre when UKCP fell back to "United Kingdom" (§4.9).

For outside-UK searches (`LocationSearchOutsideUK`), which postcodes.io cannot answer, every place name goes to Nominatim without its UK restriction, card locations included, though not the shortlist's (§4.6).

### 3.4 The card's office

A card's location is the therapist's office nearest the search, and most cards give only its district, whose pin sits at the district's middle, a mile or two from the office. The profile lists each office's address, most with the postcode, and the office's fees as free text under a "Cost:" heading. Of 32 cards sampled on 2026-09-30, the nearest 16 to Brighton and to Leeds, 20 had the full postcode of their office on the profile, 6 only its district, and 6 cards gave only a town or nothing. Of 40 sampled on 2026-10-01, the nearest 20 to each, 20 offices gave a fee in pounds, 3 a bare number and 17 none.

So the browser asks the Worker about the office each card names (§5.1). UKCP writes a card's location as the office's town and the first word of its postcode, which begin a line of that office's address: the office named is the one with such a line, a line that is the whole location beating one that goes on to the rest of a postcode, and the first listed between equals. A profile opened from the card puts the same office first, as the nearest. The answer gives that office's postcode and fee text, where it has them.

- For a card whose location ends in a district, the pin moves to the office's postcode, if it is in that district, once that is placed. Until then the card's own lookup places it, and it stays there when the office gives no such postcode or any of these lookups fails. A card giving a full postcode is placed by it already, and one giving only a town keeps its place. The card keeps UKCP's words; only the pin moves.
- The card shows the office's fee on a line under its session types (§4.4): its one amount in pounds, or "From" the lowest of several, the far end of a range such as "£60 -70" included. A card shows none while its answer is on its way, or when the office names no amount in pounds.
- Cards ask whether or not the map shows them: those in the pages loaded, and the shortlist's while its tab and their group are open (§4.6). A card naming no place does not ask, nor does one in an outside-UK search, whose districts could be anywhere and whose fees are seldom in pounds.
- At most four of these requests are in flight from a page at once, so UKCP never sees a page's twelve at once, and one whose card is no longer shown by its turn, after a new search say, is never sent.
- The answer is kept for 30 days, or a week when the office gives neither postcode nor fee, in case the therapist adds them, so a card's fee can be up to 30 days old where the profile's is at most an hour. The card, kept for 15 minutes, still decides who is listed and at which office, so an old answer can't bring back a therapist UKCP has dropped, and a therapist who moves office asks afresh. The profile itself is kept for an hour (parity §4.2), since UKCP drops therapists on suspension.

## 4. Front end

### 4.1 Page layout

- The search page fills the viewport, with the map filling the space the results leave. There is no site header once there is a search. On this page `SiteLayout` drops its width cap, padding and header, and the site's name and the theme switch head the results instead (§4.2, §4.3), or the page while it shows the prompt (§4.10). Other pages keep their layout, with those two in a header above the page.
- The site's name is not a link. Resting the mouse on it shows the about text in a card; a click, tap or Enter pins the card open and moves focus into it, so touch and the keyboard reach its links.
- On a window at least 64rem wide and 31rem tall the results sit in a panel beside the map (§4.2); below either, the list leads and the map takes its place when asked for (§4.3). Both hold the same results component.
- The map pane loads as its own chunk, so the results render without waiting for Leaflet, and only once there is a search (§4.10); until it arrives the pane is a plain muted background.
- The attribution control carries "© OpenStreetMap contributors © CARTO", as the tile terms require. The about text gains a data-sources line for postcodes.io (Ordnance Survey, Royal Mail and ONS data under the Open Government Licence) and Nominatim (OpenStreetMap).

### 4.2 Results panel (wide screens)

- A 24rem panel down the left, beside the map rather than over it, so no pin hides behind it. It is an ordinary region, not a dialog: the map stays usable and focus is never trapped.
- It opens with the site's name and the theme switch (§4.1). Beneath them, its header holds the tabs between the results and the shortlist (parity §4.4) and an icon button, "Hide list", that collapses the whole panel, name and switch included, to a narrow strip holding a "Show list" icon button, giving the map the full width. Both name themselves in a tooltip and carry `aria-expanded` and `aria-controls`. The panel opens on every visit; its state is not stored. The map is told its size changed (Leaflet's `invalidateSize`) whenever the panel opens or closes.
- Hovering or focusing a card highlights its pin (§4.6).

### 4.3 Phones and short windows

The list leads, with the map a press away, as `2026-10-02-list-first-design.md` sets out.

### 4.4 The results list

- The results are one list, in the order the browser keeps (parity §4.1), that grows a page at a time with "Load more"; the map shows every therapist in it that it can place. The button sits beneath the list, outside its scrolling area, so it stays in view however far the list scrolls. UKCP orders location searches by distance band (parity §3.3), so each page reaches further out.
- A card shows the photo, 96 pixels across, beside the name, place, session types and its office's fee (§3.4), with the summary and tags beneath at the card's full width. The place is the postcode or district alone followed by the distance, as in "E8 (0.2 miles away)": the town mostly repeats the searched place. A card with no distance, as in a search with no place, or with no postcode in its location keeps the location whole, since there it is all that says where someone is. A card in a pin's box (below) leaves the place to the box's heading and gives only the distance, as in "0.2 miles away". Tags are shown only when the search asks for them by name, as a help-with term, a ticked box or the keyword. Phone numbers are left to the profile's contact details (parity §3.4).
- Therapists who share a stacked pin (§4.6) are listed together where the first of them comes, in a box headed by the location they all list with their number, or by the postcodes, districts or places that placed them when they write it differently; an office's postcode (§3.4) stands in for the card's location of whoever it placed. Their names sit beneath that heading as `h3`s. Cards join the box as their locations are placed and as "Load more" brings others to the pin; a keyboard handed on from "Load more" waits for the new cards to be placed, their offices' postcodes included, since joining or leaving a box redraws a card.
- Results come from `/api/search` in batches of 480, each one upstream request within the parity §4.3 limit, and "Load more" shows them twelve at a time, asking for the next batch only once the last is used up. UKCP reshuffles equally distant results about once a minute (parity §3.2), so pages asked for one at a time would repeat some therapists and skip others; each batch is put in the browser's order as it arrives, and a therapist repeated where two batches meet is shown once. UKCP takes any page size: 480 answers most towns in one request (Leeds has 231 results) in about a second and about 65 KB compressed, where a whole city (London has 3,579) would outrun the Worker's 10-second upstream timeout. A search without a location asks for every result at once instead (parity §4.2), since UKCP shuffles the whole set and the browser can keep its order only by having all of it; its one batch then holds everything, and "Load more" never asks again. Online Therapy alone, 5,152 results, is 8.5 MB (0.8 MB compressed) and takes UKCP about 7 seconds, and the whole register of 8,461 would take about 12; with a filter or two most run to 2,000–3,000 results and 3–5 seconds. Should UKCP answer fewer than asked, the first batch's length sets the step. A search near a place also asks `/api/search/early` for its nearest 48 beside the first batch, which UKCP answers in about 0.2 seconds against 0.4 to 1 for a batch. Until the batch arrives the list shows those of the 48 nearer than the furthest of them: UKCP lists nearest first, so it has sent everyone that near, and the batch puts them first in the same order, so no card moves when it lands. Outside London the 48 hold a whole first page, 30 to 47 settling in each of the nine cities sampled; London's 100 or so cards at 0 miles, offices UKCP can't measure, leave none settled, and the list waits for the batch. Changing the search starts again from the first page. The page URL never carries `page`; a link that has one opens at the first page.
- The list is headed by its count: "257 results", or "257 results within your area" when a place was searched. A search that finds no one says so there alone. Beneath, a line reads, for a location search, "Nearest 24 of 257, up to 0.6 miles away", using the furthest of UKCP's distances among the loaded cards; any other search reads "24 of 257". When any loaded therapist has no pin it adds "3 not on the map" (§4.8). Beneath sit "Pins show the postcode or area each therapist lists.", then the "Location searched" line or the alert that replaces it (§4.9), and UKCP's notices.
- "Load more" shows a spinner while a page loads and disappears once every result is loaded; the map then takes in any new pins (§4.7). While the first page loads, the list shows skeleton cards. A search without a location that has not answered after 2 seconds adds "Getting every result. The first time can take a few seconds." above them, or above the dimmed list it replaces.
- A profile opened from the search leaves it rendered beneath (§4.11). Coming Back to the search from another page restores the view: search results stay cached for 15 minutes after the page unmounts (a `gcTime` matching the existing `staleTime`), and the list's scroll position and the map's centre and zoom are kept in memory against the history entry, so Back finds them. A fresh visit or a shared link starts at the nearest 12 with the map fitted (§4.7).

### 4.5 Search and filters over the map

- Along the top of the map sit the location box with its Search icon button and a Filters icon button carrying on its corner how many filters are ticked (`TickedCount`), with the active-filter chips (`FilterChips`) beneath. Both icon buttons name themselves in a tooltip. Search with the box empty searches nothing: it asks beneath the box for a town or postcode, until the box is typed in or located or another search arrives.
- Inside the location box's right end, where the browser offers geolocation, sits a "Use my location" icon button. It asks the browser for a position up to five minutes old, looks up the nearest postcode (§5.1) and searches that with the typed keyword, putting the postcode in the box. A refusal, a failure or no UK postcode within 2 km shows a one-line reason beneath the box until the next attempt or keystroke. On narrow screens the chips form one row that scrolls sideways.
- On wide screens "Filters" opens the filter panel beneath the search box, floating over the map and scrolling within itself, with its "Refine your search" heading and close button on one line. It is open on arrival at the prompt (§4.10), which has no map for it to cover, unless the shortlist is beside the prompt, which would leave the prompt too little room; it is closed on arrival at a search. A search for a place, typed in the location box or located, puts it away to show where the results are; ticks and the keyword leave it open for more. On narrow screens it opens the existing "Refine your search" sheet, which is always closed on arrival.
- The filter panel keeps everything but the location box: "Clear all filters" (§4.10), keyword and the option groups. "Search locations outside the UK", which UKCP sets beside its location box, is the last box in Additional Filters, whose help gains a line on it, and counts among that group's ticks. It changes how the location is read rather than narrowing the results, so, as with "Clear all filters" keeping it (§4.10), it makes no chip and the Filters button's count leaves it out. The location and keyword share one draft, so any change submits whatever is typed in either, as the filter panel does today.
- Every location search reaches 30 miles, the furthest UKCP's form offers, and links to UKCP's own page ask for the same. There is no distance setting, and a `Distance` in an old link is ignored: results come nearest first, so the reach only lengthens the list, and the list's opening line says how far it goes (§4.4).

### 4.6 Pins and clusters

- A pin is the therapist's `Avatar` (photo or initials) in a Leaflet `divIcon`. It is keyboard-focusable with the therapist's name as its title, and hovering shows the name and listed location. Where the pointer can hover (`(hover: hover)`), hovering a pin or cluster also raises, enlarges and rings it as hovering a card does; touch goes without, since a tap would leave it enlarged.
- A therapist whose session types include Remote but not In-person gets a small lucide `Video` badge on the pin, since their location says nothing about travel.
- Therapists who share one point form a single stacked pin: up to three avatars and the count.
- Nearby pins merge into clusters with `leaflet.markercluster`, drawn the same way. Clicking a cluster zooms to its bounds, and clustering stops at zoom 16, so every cluster splits before the map runs out of zoom. Leaflet's spiderfy (fanning the markers out) is off.
- Activating a single pin on a device that can hover (`(hover: hover)`) opens the therapist's profile (§4.11), since hovering has already shown who it is. Otherwise, and for a stacked pin on any device, it selects: the pin's entry in the list (its box, or the one card) is outlined in blue, marked `aria-current`, and scrolled into view unless already wholly in view. The panel opens if collapsed, opening at the entry, and a list already showing glides there unless reduced motion is preferred; where the list leads, it comes back in the map's place at the entry (list-first §3.4). Activating the selected pin again clears the selection, as does clicking the map away from any pin. Where the pointer can hover, a selection lasts only while the pointer is on the pin: moving off it, or zooming out until a cluster gathers it in, clears it. The selected pin, or the cluster holding it, keeps a blue halo that pulses briefly unless reduced motion is preferred. A new search, or a change of tab, clears the selection.
- Hovering or focusing a card raises its pin, enlarges it and rings it in blue, or does the same to the cluster holding it. A ring is a disc behind each avatar, inside the icon so it scales with it, so a stack's ring traces its circles; it is blue because the theme's greys vanish against the tiles.
- While the Shortlist tab is open beside a search, the map shows the shortlist in place of the results: a pin for each shortlisted therapist it can place, drawn and stacked as above. A shortlist gathers therapists from any search, so their places are chosen as though there were no centre (§3.2), and none is set aside as too far from it. They are read as UK places whatever the search, since an overseas reading with no centre to choose by could put a UK therapist abroad. Their places, office postcodes included, are looked up only once the map shows them, though their offices are asked about while their cards show, for the fee (§3.4). A therapist taken off the shortlist loses their pin, though their card stays to put them back (parity §4.4). Hovering a shortlisted card highlights its pin, and selecting a pin marks the card of everyone at it in the shortlist, which stays open. The shortlist's opening line adds how many the map can't place, as the results' does (§4.4).
- The open list is the complete accessible alternative; the map has the label "Map of results", or "Map of your shortlist" while it shows the shortlist.

### 4.7 Centre, zoom and fit

- A blue pin, which shows on light and dark tiles alike, marks the search centre (§3.3) on the results' map. It stands above the therapists' pins, which often share its point, but beneath a hovered or selected one, and takes no clicks.
- No circle shows how far the list reaches; its opening line says so (§4.4). UKCP measures to each therapist's full address, but a card giving only a district is pinned at the district's middle until its office's postcode is known, and for good when the profile gives none (§3.4), so a circle drawn to UKCP's miles would leave pins outside it: in Brighton, 446 of the first 480 cards give only a district, and such pins lie 1.5 to 1.9 miles out while the first 150 cards reach 1.5 miles.
- The map frames the centre and every placed pin once a search's first page is placed, or the whole 30 miles searched when no pin is placed, and frames them again whenever "Load more" places further pins. Without a centre it frames the placed pins. An office's postcode (§3.4) holds back no frame, and a pin moving to one frames nothing again: the map frames afresh when more therapists are placed, not when a stack splits. The frame is padded clear of the search box where that lies over the map, and zooms no closer than level 14. A view restored on Back (§4.4) is kept until therapists are placed beyond those it took in. Opening the Shortlist tab frames the shortlist's placed pins alone, and opening the Results tab again frames the results afresh.
- A search opened from a link or a reload draws no tiles until its first frame, or until it turns out to have nothing to frame, and jumps to that frame rather than animating, so a search that frames its results never fetches the UK overview's tiles first (§6). A view restored on Back loads its tiles at once.
- shadcn-map's zoom control sits bottom right on wide screens. Narrow screens rely on pinch zoom.

### 4.8 Unplaced therapists

A therapist has no pin when their card gives no location or only a postcode area, when the location matches nothing or only implausibly far away (§3.2), or when the lookup fails or is rate limited. Their card stays in the list, in UKCP's order, with no word on why, and the list's header counts them (§4.4).

### 4.9 Unrecognised location

When the visitor typed a location but UKCP searched "United Kingdom" (parity §3.2), the results show an `Alert` in place of the "Location searched" line: `UKCP didn't recognise "Brightn", so these results are from across the UK. Try a town or a postcode.` It is skipped when the typed text itself names the UK ("UK", "United Kingdom"). The map then has no centre (§3.3).

### 4.10 The prompt

- Near me searches only once there is a place: without one, UKCP would list every therapist matching in a random order, which answers no one looking nearby. Until then the page asks UKCP for nothing, and loads no map, whose tiles of the UK would count against CARTO's allowance (§2) for nothing. In the map's place, in large type, a prompt asks for a town, city or postcode and says what the filters narrow the search by; on wide screens it moves to the right of the filter panel while that is open (§4.5). With no results to head, the site's name and the theme switch head the page (§4.1). A visitor's shortlist is a tab beside the prompt, as it is beside a search's results. Once beside the prompt, it stays until a search, so a therapist removed there can still be put back. Ticks and the keyword set before a place wait in the URL, their chips showing, and apply to the first place searched. The page returns to the prompt whenever the location is cleared.
- The online view likewise searches only once a filter narrows it, and the session types do not count, since online or by phone alone leaves thousands in a random order. Until then a prompt in large type fills its Results tab, saying what the filters narrow the search by, with the Shortlist tab beside it as ever. Removing the last filter brings the prompt back.
- "Clear all filters" searches the typed location alone, keeping the "Search locations outside the UK" tick, since a search with nothing left would land back on the prompt.

### 4.11 Profiles in a drawer

- A profile opened from a card or a pin shows in a drawer from the right, over the search, which stays rendered beneath it. The URL becomes `/#/therapist/:slug`, carrying the search's location as React Router's background location, so closing the drawer or Back returns to the search exactly as it was, and `SiteLayout` keeps the search's layout beneath.
- A profile reached any other way, such as a shared link, is a page of its own, as before; a reload keeps whichever it was, since the browser keeps the history entry's state. The profile lays itself out by the width it is given, so it reads the same in the drawer as on a narrow page.

## 5. Worker: place and office lookups

### 5.1 Route

| Route | Body | Cached as | Upstream | Cache |
|---|---|---|---|---|
| `POST /api/place` | `q`, `centre`, `outsideUK`, `country` | `/api/place?q=<text>[&centre=true][&outsideUK=true][&country=<code>]&v=<version>` | postcodes.io or Nominatim | 30 days when found; 1 day when not found or too general |
| `POST /api/nearest` | `lat`, `lng` | `/api/nearest?lat=<degrees>&lng=<degrees>&v=<version>` | postcodes.io | 30 days when found; 1 day when not found |
| `POST /api/office` | `slug`, `location` | `/api/office/:slug?location=<location>&v=<version>` | Profile GET (parity §3.4) | 30 days when the office gives a postcode or fee; a week when it gives neither or none is named; not kept when UKCP has no such profile |

- The text or point travels in the body and is cached by canonical URL, as a search is (parity §4.2).
- One string per request, so Workers Caching keys each string on its own and shares it across visitors, where a batch would rarely repeat. A page needs at most 13 lookups (12 cards and the centre), and as many again for offices (§3.4), fewer once repeated strings are merged, sent in parallel over one HTTP/2 connection.
- `q` must be 1–100 characters after trimming. The Worker canonicalises it with `shared/location.ts`, so equal strings share one entry.
- `v` is `LOOKUP_VERSION` in `worker/app.ts`, part of both routes' canonical forms, set by the Worker whatever the browser sends. Cached answers outlive a deploy (parity §4.2), so a change to what either route answers sets it to that day's date, never a value used before, and every lookup moves to new entries rather than waiting up to 30 days for the old answers to expire.
- `country`, a two-letter code, keeps a lookup to that country: the text goes whole to Nominatim there, since the UK's postcode rules mean nothing abroad.
- `/api/nearest` answers the postcode nearest the visitor, for a search from where they are. The browser rounds the point to three decimal places, about 100 metres, before sending it, and the Worker rounds anything finer before it reaches the cache, so no cache sees a finer position.
- `/api/office` answers the postcode and fee text of the office the card's location names (§3.4). The location must be 1–100 characters after trimming, and is canonicalised as `q` is. The Worker has no HTML parser, so it reads the office sections by pattern, never the page's footer, which holds UKCP's own address, and picks the office with `shared/office.ts`, as the profile does. Its `v` is `OFFICE_VERSION` in `worker/app.ts`, which changes as `LOOKUP_VERSION` does.
- Upstream requests to the geocoders, each with a 5-second timeout:

| Kind | Request |
|---|---|
| Postcode | `api.postcodes.io/postcodes/<postcode>` |
| Outcode | `api.postcodes.io/outcodes/<outcode>` |
| Place, on a card | `api.postcodes.io/places?q=<name>&limit=10` |
| Place, as the centre, in an outside-UK search or in a given country | `nominatim.openstreetmap.org/search?q=<name>&format=jsonv2&countrycodes=gb`, with `limit=1` for a centre and `limit=10` for a card, no `countrycodes` outside the UK, and the given country's code for one |
| Nearest postcode | `api.postcodes.io/postcodes?lon=<lng>&lat=<lat>&radius=2000&limit=1`, 2 km being as far as postcodes.io looks |

### 5.2 Response

```ts
type PlaceLookup =
  | { found: true; kind: "postcode" | "outcode" | "place"; candidates: { lat: number; lng: number; type?: string }[] }
  | { found: false; reason: "too-general" | "not-found" };

type NearestLookup = { found: true; postcode: string } | { found: false };

type OfficeDetails = { postcode?: string; cost?: string };
```

`type` is a place candidate's settlement type, mapped from postcodes.io's `local_type` or Nominatim's `addresstype` onto the order in §3.2; types outside it rank last.

### 5.3 Limits and errors

- Uncached lookups count against a new rate-limit binding, `PLACE_LIMIT`, of 60 a minute per IP, keyed as in parity §4.3. It is separate from UKCP's limit, so geocoding never uses up a visitor's searches. Past it, the route returns `429`.
- An upstream failure or timeout returns `502` and is never cached. The browser shows that therapist as unplaced with the "just now" reason (§4.8) and asks again on the next visit to the search.
- Nearest-postcode lookups share `PLACE_LIMIT`, and fail the same way.
- Uncached office lookups count against their own binding, `OFFICE_LIMIT`, of 60 a minute per IP, since a page's twelve and a "Load more" would use up the 20 that UKCP searches have (parity §4.3). Past it the route returns `429`, a profile UKCP doesn't have `404`, and a UKCP failure `502`, none of them cached; the pin stays where the card put it, and the card shows no fee (§3.4).
- The routes log only a status, never the text or point looked up (parity §2).

## 6. Map component

- `src/components/ui/map.tsx` is vendored from shadcn-map (`https://shadcn-map.vercel.app/r/map.json`), keeping only `Map`, `MapTileLayer`, `MapMarker`, `MapTooltip`, `MapMarkerClusterGroup` and `MapZoomControl`. Its drawing, fullscreen, layers, search and locate controls go, with the dependencies only they need (`leaflet-draw`, `leaflet.fullscreen`, the place-autocomplete registry item), as does `next-themes`, since the app has its own theme switch, and the lazy-loading wrappers it has for server rendering, since the map pane is already its own chunk (§4.1). Pin and cluster icons are plain DOM elements rather than rendered React, because Leaflet creates and discards them itself as clusters change.
- Dependencies: `leaflet` 1.9, `react-leaflet` 5 and `leaflet.markercluster` 1.5. For the cluster wrapper we use `react-leaflet-cluster` 4, which is stable on React 19, rather than shadcn-map's `react-leaflet-markercluster`, whose React 19 version is still a release candidate.
- Tiles are CARTO's `light_all`, or `dark_all` while `<html>` has the theme switch's `dark` class, swapping live when the theme changes. The key is read at build time from `VITE_CARTO_KEY`, which the deploy job sets from a `CARTO_KEY` Actions variable; it ships in the page, so it is a variable rather than a secret. Without a key, as in local development and CI's check job, the map uses OpenStreetMap's standard tiles in both themes.

## 7. Errors

| Condition | UI |
|---|---|
| The first page fails | The list's message (parity §6) in the list; the map shows no pins and no centre, which comes from that page |
| "Load more" fails | The same message above the button beneath the list, which now reads "Try again"; loaded results stay |
| The centre lookup fails | No centre pin; the map fits the pins, and place names are chosen as if there were no centre (§3.2) |
| A pin's lookup fails | Unplaced, with the "just now" reason (§4.8) |
| An office lookup fails | The pin stays where the card's location put it, and the card shows no fee (§3.4) |
| Tiles fail to load | Leaflet's blank background; pins and clusters still work |

## 8. Testing

- **Location text:** unit tests of classification and canonicalisation covering every row of §3.1, including the live strings in §2.
- **Worker route:** Vitest calling the Hono app with a stub `fetch` for postcodes.io and Nominatim and a fake rate limiter. Cases: each kind, the fallback chain, the canonical form, `Cache-Control` for found and not found, `502` on upstream failure, `429`, and `countrycodes` dropped outside the UK. For offices, with a stub UKCP client: the postcode and fee of the office the card names, the postcode spaced or not; either alone; none; an address outside the office sections ignored; `404` for a missing profile; `OFFICE_LIMIT`.
- **Pin logic:** unit tests of candidate choice with and without a centre, the plausibility cut, grouping pins that share a point, remote-only detection, the reach line and the unplaced reasons. Which cards ask about their office; which office a location names; a district card's pin moving to the office's postcode once placed and staying put when there is none or a lookup fails; the fee's wording; no more than four office requests in flight.
- **Components:** the prompt asks UKCP for nothing and shows no map; "Load more" appends a page, stays beneath the side bar's scrolling list, and the URL gains no `page`; a new search starts again at the first page; the panel collapses and reopens; where the list leads, its button shows the map in its place and the list again; therapists sharing a pin are listed together under their place, which the pin's selection marks and scrolls into view; hovering a card reaches the map as a highlighted pin; the centre is marked and the frame grows with "Load more" to take in further pins, but not as a stack splits; a profile opens in a drawer over the search and closing it returns to the search unchanged; Back restores the list's scroll; the tiles follow the `dark` class; the unrecognised-location alert. Leaflet is mocked under jsdom.
- **Manual:** a pass in the browser against the dev server for what jsdom can't show: pins, cluster zoom versus selection, the centre pin and the fit, the refit on "Load more", the pin rings and halo in both themes, the panel resizing the map, the list and the map in turn on a narrow viewport, the drawer, and dark tiles.

## 9. Delivery

One pull request, whose commits build it in this order:

1. This spec and the place lookup: `shared/location.ts`, `/api/place`, the `PLACE_LIMIT` binding and the API client method.
2. The unrecognised-location notice (§4.9).
3. The results list with "Load more" in place of page numbers (§4.4), before any map.
4. The map components: the vendored `map.tsx` and its dependencies.
5. The fixed 30-mile search (§4.5).
6. The map-centred page: its layout, the results panel and sheet, the search and filters over the map, and the map pane with its fit, themed tiles and attribution.
7. The pins: pins, stacked pins, clusters, selection, card highlighting, the unplaced lines and the about text's data sources.
8. The prompt (§4.10).
9. The profile drawer (§4.11).

Before it deploys, the repository needs a `CARTO_KEY` Actions variable holding a CARTO basemaps key; until then the live map shows OpenStreetMap tiles.
