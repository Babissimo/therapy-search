# Therapy search: filtering before asking UKCP

Date: 2026-10-01

## 1. Goal and scope

Ask UKCP for fewer searches by letting visitors finish choosing filters before a search runs. A search runs on every change today: each tick, the keyword and each place rewrite the URL, the results query keys on the URL, and so each change is a request unless the Worker's cache holds that exact search (15 minutes near a place, 6 hours online). A visitor who searches a place and then ticks three boxes makes four requests, and on a phone the filter sheet covers the list while those requests run.

In scope:

- Ticks wait as a draft until the visitor asks for results (§3)
- The start screen leads with the filters, and a place searched with nothing ticked prompts for filters first (§4)
- "Only with photos" cut from results already loaded, where they are complete (§5)

Out of scope:

- Counts beside each option, which would need a table of every option's total kept fresh against UKCP.
- Requiring more than one filter online. Online's rule stays as it is: any filter besides Type of Session.
- The pre-search questionnaire. It can fill the same draft (§3.1) when it is built.

## 2. Constraints

- **A link shows what was on screen.** The URL keeps the search whose results show, never the draft, so a shared link, a reload and Back from a profile all show the list the visitor saw.
- **No silent result changes.** Results change only when the visitor asks for them, which also serves screen-reader users.
- **The draft lives in this page.** Ticks not yet searched are not stored anywhere, and are forgotten when the search page is left.

## 3. Ticks wait for the visitor

### 3.1 The draft

`useSearchDrafts` holds a whole search rather than the two typed boxes: the typed place and keyword as now, and every tick, flag and help-with term. It stays outside React state, so a tick redraws the panel and the controls that read the draft, not the list or the map. Whenever the URL's search changes, the draft takes its filters; each typed box keeps its own rule (reset when the URL's value for it changes).

The draft is pending when its filters (everything but the place) differ from the URL's.

### 3.2 What changes only the draft

- Ticking or unticking a box, in any group, including the outside-UK tick.
- "Clear all filters", which keeps the place and the outside-UK tick as now.
- Typing in the keyword box.

### 3.3 What searches, taking the whole draft

- Searching a place: the box, Use my location, and Search this area on the map.
- The panel's apply button (§3.5).
- Closing the filters while the draft is pending: the phone sheet by any means, and on wide screens their close button or the Filters button. Closed with nothing pending, they search nothing, so a place half typed in the box isn't searched by putting them away.
- Enter in the keyword box.
- Removing a chip, which searches the draft less that filter.
- Switching between Near me and Online, which carries the draft to the other view. The link to the view on show stays the search on show.

Chips keep showing what the list on screen is filtered by, so a box ticked with no chip is one not yet searched.

### 3.4 The dot

A box whose tick differs from the search on screen shows a small amber dot after its label, the site's highlight colour. Its checkbox is described as "Not yet searched" for screen readers. Group headings' counts and the Filters button's count follow the draft, as they count what the panel shows ticked.

### 3.5 The apply button

- **Phone sheet, both views:** "Show results" at the sheet's foot, which closes it, and closing it searches (§3.3). A view offers the sheet once it has a search; before then its filters sit in the list (§4.1).
- **Wide, Near me over the map:** "Update results" at the foot of the filters, which stay open.
- **Wide, Online:** "Show results" at the foot of the filter column before the view's first search, "Update results" after.
- **Before a search:** Near me has none, as the place search (§4) takes the ticks; online's foot of the filters reads "Show results", in the column on wide screens and in the list on a phone.

The wide buttons stay in place, marked unavailable while the draft holds nothing new (online before its first search, also while the draft doesn't narrow it by online's rule; after it, unticking the last such filter goes back to the prompt), so a keyboard user keeps their place as the search begins.

## 4. The start screen leads with filters

### 4.1 Layout

Until Near me has a place to search:

- The prompt reads "Start with what matters to you.", as online's does, and asks for ticks first and the place last.
- The place box moves below the filters, under "Where are you?". On wide screens it sits at the foot of the column right of the prompt; on a phone the filter groups sit in the list under the prompt, since the list is empty until a search, and the place box follows them. The Near me / Online switch stays at the top.
- When the search begins, the place box moves to the toolbar over the map as it does now.

Online's start screen on a phone sets out its filters the same way, with Show results where Near me has the place box.

### 4.2 A place searched with nothing ticked

From the start screen, searching a place (typed, or by Use my location) with no filter in the draft does not search. Anything that would make a chip counts as a filter; the outside-UK tick does not.

- The prompt gives way to "Before we search near {place}" with "A tick or two keeps the list to people who suit you." It takes focus, so it is read out.
- A "Search without filters" button under the place box searches the place as it stands. Choosing it stops the prompt for as long as Near me stays open.
- Searching again once something is ticked searches as usual.
- A link that already carries a place opens on its results, and a search once the map shows (a new place, Search this area) never prompts.

## 5. "Only with photos" from loaded results

When a search with "Only with photos" is applied and the same search without it is already in the page's cache with every result in its first batch, the results are that batch's cards that show a photo, counted afresh. Every result is in the first batch for the online view (its whole set) and for a place search whose total fits in one batch of 480, which is every place but the largest cities. Otherwise the search asks UKCP with the flag, as now.

This rests on UKCP's flag keeping exactly the cards that show a photo, checked against one live search both ways before it ships.

## 6. Testing

- The draft store: pending, reset on a new search, and each way of searching taking the whole draft.
- The panel: ticks leave the URL alone, the dot and its description, the apply button's label and presence in each layout, closing the sheet searching.
- The start screen: the order of the prompt, filters and place box; the prompt for filters on an unfiltered place search, its focus, Search without filters, and no prompt for a link with a place.
- Results: a photos-only search cut from a complete cached batch asks nothing, and an incomplete one asks UKCP.

## 7. Delivery

Three PRs. §3 first, with this spec; §4 stacked on it; §5 on its own from main, as it touches only the results query.
