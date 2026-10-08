# Therapy search: a few questions, then one profile at a time

Date: 2026-10-08

## 1. Goal and scope

A gentler way in for anyone the filter panel daunts. A visitor answers a few questions one at a time, which become an ordinary search, then goes through its therapists one full profile at a time, saying Yes, Maybe or Not for me to each. Sorting by hand is the point: the yeses and maybes land on the shortlist, where they are compared and refined, and from there the email drafter takes over. It builds on the shortlist's statuses ("statuses §n", `2026-09-30-shortlist-statuses-design.md`), the email drafter ("drafter §n", `2026-10-08-email-drafter-design.md`) and filtering before searching ("filter-first §n", `2026-10-01-filter-before-searching-design.md`).

In scope:

- The questions, beside the start screens' filters, ending in a search (§3)
- A line at the end of any filtered list saying how to see more (§4)
- Maybe as a status and a list of those passed over (§5)
- The walk: a search's therapists one profile at a time, from any results list (§6)

Out of scope:

- Matching any of several topics. UKCP returns only therapists who help with every topic asked for, and asking it once per topic would multiply searches; §4 tells the visitor how to widen instead.
- Swiping. A sideways swipe on a page that scrolls fires by accident, and the buttons are needed for those who can't drag anyway.
- Single-key shortcuts, which WCAG 2.1.4 would require a way to turn off.
- A budget. Fees arrive card by card as results load, so a search can't be sorted by them, and cards and profiles show them already.
- The questions as the front door. They sit beside the filters for now.
- The plain search (`/plain`), which keeps its own pages.

## 2. Constraints

- **Nothing leaves the browser through the site.** Answers are a draft in this tab (sessionStorage) until they become a search; sorting choices are kept in the shortlist's record (localStorage), so clearing the shortlist clears them.
- **One search, as the filters would make it.** The questions ask UKCP nothing until the last one, apart from looking up a typed place, and then make the same search the panel's ticks would. The walk reads each profile as opening it would, and the next one a step ahead.
- **A link shows what was on screen** (filter-first §2). The search the questions make is an ordinary search URL, so chips, filters, the map and a shared link behave as for any other.
- **The record stays at version 1**, with Maybe and the passed list as optional additions (statuses §2).

## 3. The questions

### 3.1 Shape

- At `#/questions`, reached by "Answer a few questions instead" under the prompt on both start screens (Near me and Online).
- One question per screen, with Back, Next and a count ("Question 2 of 8"). The count is worked out from the answers so far, as some answers skip questions. Each question is its own history entry, so the browser's Back goes to the one before.
- Every question can be skipped: Next with nothing chosen sets nothing, and questions 2, 4 and 8 also offer "Not sure".
- The answers are kept in sessionStorage as the visitor goes, so a reload keeps them, and are forgotten with the tab.

### 3.2 The questions and what they set

| # | Question | Answers | Sets |
|---|---|---|---|
| 1 | Is it urgent? | I need help today / It can wait a few weeks | "Today" shows help now first (§3.3) |
| 2 | Who is it for? | Me / My child or teenager / Me and my partner / My family | Works with: nothing / Children and young people / Couples / Families |
| 3 | What would you like help with? | Any of the themes (§3.4) | Help with, one tick each |
| 4 | How do you want to meet? | In person / Online or by phone / Either | In person: the face-to-face and home-visit ticks, near a place. Online or by phone: the Online view. Either: near a place, no session ticks |
| 5 | Where are you? | A postcode or town, as the start screen asks (#215) | The place. Skipped for online or by phone |
| 6 | Would you like therapy in a language other than English? | No / Yes, then one language | Languages |
| 7 | Do you need step-free access? | No / Yes | The wheelchair tick. Skipped for online or by phone |
| 8 | How will you pay? | Myself / A health insurer / I can't afford it | A health insurer: Works with, Private healthcare referrals. "I can't afford it" shows low-cost help (§3.3) |

"Me" and English set nothing: nearly every therapist sees individuals and works in English, and either tick would drop any who leave that part of their profile blank. English is left out of question 6's list.

Question 3's wording follows question 2: "What would you like help with?", "What would your child like help with?", "What would you both like help with?", "What would your family like help with?".

### 3.3 Help now and low-cost help

Each is a screen between questions, with "Carry on" to the next question:

- **Help now**, after "I need help today": that a therapist found here is usually weeks from a first session, then the site's help-now line (111's mental health option, Lifeline in Northern Ireland, Samaritans, Shout, 999).
- **Low-cost help**, after "I can't afford it": free routes through the NHS in each of the four nations (a GP's referral anywhere in the UK, and a route to refer yourself in each nation with one that covers the whole nation, given with its age and who it is for), low-cost counselling from charities, and that some therapists here offer lower fees to those on low incomes, so it is worth asking. Each route is checked against its nation's NHS pages when the screen is built, with the sources in a comment beside the text.

### 3.4 Themes

Eleven plain themes, each one of UKCP's topics, with UKCP's word beneath when it differs, as the chip will show it:

| Theme | UKCP's topic |
|---|---|
| Anxiety or worry | Anxiety |
| Low mood | Depression |
| Stress | Stress |
| Grief or loss | Bereavement |
| Relationships | Relationships |
| Trauma | Trauma |
| Abuse | Abuse |
| Family | Family |
| Eating | Eating Disorders |
| Drink, drugs or gambling | Addiction |
| Work | Employment Difficulties |

"Something else" opens UKCP's full list, less what other questions cover or what concerns therapists' own work: EMDR, Online Counselling, Telephone Counselling, Supervision, Training and Private Practice Issues. Any number may be chosen across both, and §4 suggests focusing on fewer when they find few therapists. Choosing Suicide shows the help-now line beside the list.

### 3.5 The end

After the last question, the answers become a search and the visitor arrives at its results, with the search's history entry pushed after the questions' entries, so Back returns to the last question. Once the walk exists (§6), the last question opens the walk over those results instead.

Answers that set nothing to narrow the search don't search, as the start screens don't (filter-first §4, #77). The last screen says there is nothing to search by yet, with "Back to the questions" and "Choose filters yourself", which opens the start screen for the way they chose to meet with any place they typed already in its place box.

Answers that narrow the search but give no place, for anything but online or by phone, arrive at the Near me start with those ticks, which asks for a place as it does now (#69).

## 4. The loosen line

Once a search's list is complete (nothing more to load) and at least one filter is set, a line follows the last therapist:

"That's everyone {where} with these filters. To see more, remove a filter:", where `{where}` is the results' heading's own phrase: "near Bristol", "across the UK", "working online or by phone".

Then a button for each filter, from the same `activeFilters` the chips use, labelled as its chip and pressed as its chip's × would be: one search without that filter. With no results, the heading's "No therapists {where}" gets the same buttons, which the site so far only tells screen readers. With no filters there is no line.

A search with two or more help-with topics that finds fewer than five therapists leads the line with "Few therapists help with all of these. Try focusing on the one or two that matter most.", and lists the topics' buttons first. Five is the walk's nudge (§6.4): with fewer, a visitor can't reach it.

## 5. Maybe and not for me

### 5.1 Maybe

Maybe joins the statuses before To contact:

| Stored as | Label | Icon (lucide) |
|---|---|---|
| `maybe` | Maybe | `CircleDashed` |

- The status menu reaches it from every status, and every status from it, as statuses §3 sets out.
- A maybe's track shows "Maybe" with two buttons in place of the next step: "Yes, add to my list" (To contact) and "Not for me" (§5.2). The drafter's button stays at To contact only (drafter §4.1).
- Result cards and the shortlist's map show it as any other status (statuses §4.4, §4.6).

The Shortlist tab gives maybes a section of their own, "Maybe", open, after the visitor's list and before Set aside. Its cards reorder within it, as Set aside's do. "Yes, add to my list" moves a card to the top of the list.

### 5.2 Not for me

A passed list on the record: `passed?: Record<string, number>`, each slug with when it was passed.

- "Not for me" passes a therapist and, if listed, removes them as Remove does, so adding them back restores them (statuses §3).
- Shortlisting a therapist by any means takes them off the passed list.
- Kept 30 days, then forgotten when any page of the site loads, as those removed are (statuses §3). Clearing the shortlist clears it.
- A passed therapist's result card says "Not for me" where a status would go and fades its portrait as Set aside does (statuses §4.4), so nobody disappears unexplained. Their pin is unchanged.
- Their profile, outside the walk, says "You said not for me" with "Undo", which takes them off the passed list.

The clear dialog and the About card name the passed list with the rest ("with your notes, drafts, where you stand with them and those you said weren't for you").

## 6. The walk

### 6.1 Starting and leaving

- A results list with anyone not yet sorted offers "Go through them one at a time" beside its count, in both views. The questions' last step opens it too (§3.5).
- The walk is the profile drawer over the search, with a bar at its foot. Each step replaces the drawer's history entry, so Back, Escape or the drawer's × close the walk, leaving the search as it was, with focus on the button that opened it.

### 6.2 Order and count

- The search's own order (distance, then detail, then the browser's rank), skipping anyone listed, removed and still kept (statuses §3), or passed: anyone the visitor has already decided on.
- The drawer's header says "3 of 40 to sort". The total is the search's count less those already sorted among the therapists loaded, so it settles as later batches load. Near the end of what is loaded, the walk loads the next page as Load more would.
- The header also links "Shortlist (n)", which closes the walk and opens the Shortlist tab.

### 6.3 Choosing

- **Yes** shortlists them at To contact, **Maybe** at Maybe, both with the search as their found-by search (drafter §4.7). **Not for me** passes them (§5.2).
- Each choice is said in a polite region ("Added Sam Carter as a maybe.") and opens the next profile at its top, which was read a step ahead so it is there at once.
- **Previous** goes back a step, showing the choice made there pressed, and a different press changes it.
- During the walk the header's bookmark and status track are hidden, so there is one way to choose. The contact offer stays; marking someone contacted counts as Yes.
- A profile that fails to load shows the profile's failure line and Try again, with the bar still there.

### 6.4 Five yeses

Once five of the walk's choices stand at Yes, the next step shows, in place of a profile, "That's five", "Five is a good number to write to. You can sort and compare them on your shortlist, or carry on here.", with "See my shortlist" and "Keep going". A walk lasts from opening to closing: yeses from before it don't count, and the nudge shows once in it.

### 6.5 The end

After the last therapist: "That's everyone in this search.", the loosen line's buttons (§4), and "See my shortlist".

## 7. Accessibility

- Each question is a fieldset whose legend is the page's heading, radios for one answer and checkboxes for the themes. On Next and Back, focus moves to the new question's heading.
- The bar is a group named "Sort {name}". The chosen button, when Previous shows it, is `aria-pressed`. Focus goes to the next profile's name, and to "That's five" when the nudge shows.
- At 320 px the bar's three buttons share a row if their labels fit and stack if not.
- The walk adds no motion of its own between profiles.

## 8. Testing

- **The questions:** each answer's ticks, compared with the panel's search for the same ticks; Me and English setting nothing; skips for online or by phone; question 3's wording; Suicide's help-now line; help now and low-cost help with Carry on; Back and Next through history; answers kept over a reload; the end with nothing that narrows, near a place and online, and Choose filters yourself carrying the place; narrowing answers with no place.
- **The loosen line:** shown only on a complete list with filters; each button's search; the empty list; online wording; the few-results line, only with two or more topics and fewer than five found.
- **The store:** `maybe` written and read; passed added, taken off by shortlisting, forgotten at 30 days and cleared with the list; Not for me on a listed therapist keeping them as removed.
- **The tab and cards:** the Maybe section, its two buttons, "Not for me" on a result card, Undo on a profile.
- **The walk:** who it skips; the count as batches load; the next page loaded near the end; each choice and its announcement; the next profile read ahead; Previous changing a choice; the nudge at the fifth Yes of this walk, once; the end; closing and focus; the contact offer as Yes; a profile that fails.

## 9. Delivery

A stack of four PRs, each deploying on its own:

1. **The questions** (§3), with their link on the start screens, ending on results. This spec rides on its branch.
2. **The loosen line** (§4).
3. **Maybe and not for me** (§5): the status, the passed list, the tab's section, cards, the profile's Undo, and the clear dialog and About card.
4. **The walk** (§6): the results' button, the drawer's bar, the nudge, the end, and the questions' last step opening it.
