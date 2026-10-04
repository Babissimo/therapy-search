# Therapy search: the list first on phones and short windows

Date: 2026-10-02

## 1. Goal and scope

On a phone or a short window, lead with the list of therapists and put the map one press away, instead of a sheet of results over a map. The accessibility review of 2026-10-01 found (H6) that the sheet leaves the list no room on a short screen: at 320 × 256 (a 1280 × 1024 screen zoomed to 400%) the sheet is 88 px tall and shows 16 px of list; on a phone held sideways (740 × 360) it is 160 px tall and shows 38 px. The page itself never scrolls, so there is no way round it. Its structural idea B1 replaces H6: lead with the list. Doing so also takes a layer of screen-reader noise off the page and leaves the map's data unfetched for anyone who never asks for it.

In scope:

- When the list leads (§3.1)
- The page as one scrolling column, with Load more at the list's end (§3.2)
- The switch between the list and the map (§3.3)
- What choosing a pin does (§3.4)
- The shortlist's map (§3.5)
- The map drawn only once asked for, then kept (§3.6)

Out of scope:

- The wide layout, where the list sits beside the map. It keeps its side bar, Hide list and its folded Load more.
- A card over the map for a chosen pin, as property sites show (§3.4 says why not yet).
- Remembering whether the map was showing across a page load or a jump through history: the sheet's height was not remembered either (§3.6).

## 2. Constraints

- **Nothing lost.** The remembered view (the list's scroll per tab, the map's view, the open tab), Back and Forward, the Morph transitions, the skip links, the polite status region, print (a search prints as its list), forced colours, reduced motion, the filters sheet whose ticks wait as a draft, pin and card highlights, and the prefetch of a search all keep working.
- **Focus never falls to the page.** Whatever takes away the control that has the keyboard hands it on.
- **No sideways scrolling** at 320 px wide, and no part of the page out of reach at 256 px tall.
- **Over the map, the primary fill or the toolbar's surface,** never the secondary slate, which the tinted tiles swallow.

## 3. The design

### 3.1 When the list leads

The list sits beside the map only on a window at least 64rem wide and 31rem tall. Below either, the list leads.

The height comes from measuring the wide side bar on a Bristol search: its fixed parts take 171 px (the site's name 57, the tabs 49, the Load more strip 65), the list's padding 16, and a card with a photo and a summary 284–288 px. A whole card fits from about 475 px; 31rem (496 px) leaves a little over. At 1280 × 400 the side bar's list had 230 px, less than one card, so a short wide window comes under the rule too.

The rule is the page's one breakpoint, read once by the search page and given to both views, before a search and after it. Online and the start screen have no map, but switching between Near me and Online at one window size should never change the page's shape, so they follow it too: below it they take the phone layout, filters in a sheet or beneath the prompt.

### 3.2 One scrolling column

Below the breakpoint the search near a place takes the layout the online view already has on a phone: one column that scrolls as a whole, holding the site's name, the toolbar (Near me / Online, the place box, Filters, the chips), the Results and Shortlist tabs, which stick to the top as the column scrolls, and the list. Load more comes at the list's end. On a short wide window the column's contents are centred at the side bar list's width (`max-w-2xl`).

The column is a box filling the window rather than the document itself, as the online view's is, so the remembered scroll keeps one element per list to restore.

### 3.3 The switch

A button beside the tabs, in the bar that sticks to the top, reads "Map" with a map icon while the list shows and "List" with the list icon while the map does. It stays put and keeps the keyboard as it changes. A screen reader seldom reads a focused button's new name, so each press is said in a polite live region of its own ("Showing the map.", "Showing the list."), as the bookmark's is; nothing is said as the button appears or as a pin brings the list back, where the name taking the keyboard is read instead.

While the map shows it takes the list's place, as tall as the window below the bar, and the column scrolls down to it. The site's name and the toolbar stay above it, as they are above the list, so a new place can be searched from the map and the page keeps its heading. The tabs stay, so the map can show either list. Skipping to the results brings the list back.

The button sits in the bar rather than floating over the list, as property sites' Map buttons do, so at 400% zoom it covers none of the list, and its place in the keyboard's order is its place on screen.

### 3.4 Choosing a pin

On a touch screen, and for a stack of therapists anywhere, choosing a pin brings the list back at that pin's place, marked as it is now (amber ring, `aria-current`, forced colours' outline), with the keyboard on the first therapist's name there. The map stays as it was left, the pin still marked, for the switch to return to. Where the pointer can hover, a lone therapist's pin still opens their profile.

A card over the map would keep the map in view, but it would draw a second copy of each card, with its bookmark and status, inside the map, and on a 256 px tall window it would cover most of it. Going back to the list keeps one place where therapists are listed.

### 3.5 The shortlist

The Shortlist tab follows the same pattern: the switch maps the shortlist, with status badges, as the side bar's map does. Its therapists' places are looked up only once the map has been drawn, as they are only for the map.

### 3.6 The map drawn only once asked for

Below the breakpoint the map is not mounted, and no tiles are fetched, until the visitor first presses Map. From then on it stays mounted, hidden while the list shows, so going back and forth is instant and the map is as it was left. Leaflet keeps its last size while hidden, so a framing for more results, or a new search, lands correctly when it shows again.

The map goes, back to being drawn only when asked for, when the layout changes: a search begun from the start, a search cleared, or the window crossing the breakpoint. With no toolbar over its top left, as there is on wide screens, the map frames without the margin it keeps clear of one.

## 4. Testing

- Below the breakpoint: the order of the toolbar, the tabs and the list; Load more at the list's end; no map until Map is pressed; the switch both ways keeping the keyboard; the list's place kept across the map; a pin bringing back the list at its place with the keyboard there; the shortlist's map; the skip links bringing the list back; the toolbar hidden for the shortlist.
- Crossing the breakpoint: the status region stays, the list keeps its place, the map goes until asked for again.
- Browser checks at 375 × 812 (touch), 320 × 256, 740 × 360, 1280 × 800 and 1280 × 400: the list reachable, the switch both ways, a pin leading to its therapist, the Tab order, axe, nothing scrolling sideways.

## 5. Delivery

Two PRs. The first, with this spec, changes the layout and removes the sheet. The second, stacked on it, finishes the map on its own screen: its code fetched only once asked for below the breakpoint, zoom buttons where nothing now covers them, and the sheet's inset taken out of the map, which nothing sets any more.
