# Therapy search: drafting a first email to a therapist

Date: 2026-10-08

## 1. Goal and scope

Take the blank page out of getting in touch. A visitor about to contact a shortlisted therapist gets an email already written from what they searched for, which they can change in any way before it goes from their own email app. It builds on the shortlist's statuses, cited as "statuses §n" (`2026-09-30-shortlist-statuses-design.md`).

In scope:

- A "Draft an email" button on the track of anyone shortlisted and still "To contact" (§4.1)
- A drafter holding the draft, the parts of the search it mentions, and the visitor's name and when they are free (§4.2)
- The message, written from the search and the therapist's profile (§4.3), then the visitor's to edit (§4.4)
- Sending through the visitor's email app or the clipboard, then the offer to mark them contacted (§4.5)
- The search each therapist was shortlisted from, kept with them (§4.7)

Out of scope:

- Writing to several therapists at once. The shortlist could lead to it later; this drafts one email at a time.
- Sending from the site. The site has no backend (§2), and an email from the visitor's own address is the one a therapist can answer.
- Follow-up emails and reminders, as statuses §1 leaves dates out.
- The keyword filter, free text that no sentence can be written around. The visitor can add it in their own words.

## 2. Constraints

- **Nothing leaves the browser through the site.** The draft goes only where the visitor sends it: a `mailto:` link to their email app, or their clipboard. No Worker route, no analytics.
- **Kept with the shortlist.** Drafts, the search each therapist was found by, and the visitor's name and when they are free are stored in the shortlist's record, so clearing the shortlist clears them. The record stays at version 1 with these as optional fields, for the reasons statuses §2 gives.
- **The visitor's words in the end.** Everything the site writes is shown and can be changed before it goes: every mention starts ticked and can be unticked, and the text can be edited freely.

## 3. What UKCP gives

Sampled on 2026-10-08: 36 profiles, 12 spread through each of Leeds, Bristol and Norwich searches, read through the Worker.

| On the profile | Profiles |
|---|---|
| An email address | 28 |
| A phone number, no email | 4 |
| No contact details at all (UKCP's contact reveal answers empty) | 4 |
| A website | 17 |
| A fee on an office | 13 |
| Types of sessions listed | 29 |

Every email address was in the profile's own markup, none only in the contact reveal. No name carried a title or letters after it; three carried a middle name ("Nicola Jane Hammatt"). The first word of the name is the name to greet.

## 4. Design

### 4.1 Where it opens

The status track (statuses §4.2) gains a "Draft an email" button beside "Mark contacted" while the therapist is listed and "To contact". The track already shows on the shortlist tab's cards and on a shortlisted therapist's profile, so the button appears in both. It goes once the status moves on, and returns with the draft as it was left if the visitor moves them back. Like the next-step button, its screen reader name carries the therapist's name.

The drafter is its own lazy chunk, asked for as a track at "To contact" draws, as the profile asks for the track's (#195).

### 4.2 The drafter

A modal dialog over the page, filling a phone's screen, titled "Draft an email to {first name}". Top to bottom:

1. **Mention**: a group of chips, one for each part of the search the message uses (§4.3), all ticked to begin with. Unticking one takes its words out.
2. **When are you usually free?** and **Your name**: two optional fields. Both are remembered for every therapist (§4.7), so the second draft starts with them filled.
3. **Subject** and **Message**: the draft itself, as editable fields.
4. **Open in email app** and **Copy message** (§4.5).

The dialog is not a page of its own, so it adds no history entry: Back closes the page beneath along with it. Nothing is lost, as the draft is saved as it is edited (§4.4).

### 4.3 The message

Written from three sources: the search the therapist was found by (§4.7), their profile (§4.6), and the visitor's two fields. A part whose source is missing or unticked is left out with its words; nothing is ever written as a placeholder that could be sent unfilled.

> **Subject:** Enquiry about therapy
>
> Hello {first name},
>
> I found your profile on the UKCP register and I'm looking for {who for}. I'd like some help with {issues}. I'm particularly interested in working with {type of therapy}.
>
> I'd like to meet {how}{, for longer- or short-term work}{, and to have sessions in {language}}. I live {near place}. I'm usually free {when}.
>
> Could you let me know whether you have space for new clients{, what your fees are}{, whether your room is wheelchair accessible}{, whether you accept clients through private health insurance}, and whether you offer a first consultation?
>
> Many thanks,
> {name}

Each filter becomes one chip per value:

| From the search | Chip | Words |
|---|---|---|
| Works With: Individuals, Couples, Families, Children and young people, Groups | the option's label | "a therapist for myself", "couples therapy for my partner and me", "family therapy", "a therapist for my child", "group therapy"; with none, "a therapist" |
| I Want Help With, and HelpWith terms in that list | the term | after "help with", lower-cased except words in capitals (ADHD, AIDS/HIV) |
| Type of Therapy, and HelpWith terms in that list | the title | as UKCP writes it, with "a" or "an" by its sound ("a UTC Psychotherapist"); several joined by "or" |
| Type of Session | "In person", "At home", "Online", "By phone" | "in person", "at home", "online", "by phone", joined by "or"; "Face to Face - Long Term" or "- Short Term" alone adds the term of the work |
| Languages | the language | "to have sessions in Polish" |
| Location, on Near me | "Near Leeds" or "In the LS6 area" | a place as typed; a postcode, typed or found by Use my location, by its outward code only |
| Only show wheelchair accessible | "Wheelchair access" | the question about the room |
| Works With: Private healthcare referrals | "Private health insurance" | the question about insurance |

Left out: Works With "Companies" (an organisation's enquiry, not a person's), UKCP colleges and "Only show profiles with photos" (meaningless to the therapist), and the keyword (§1). A HelpWith term is placed by the list it belongs to; every one of UKCP's terms is in one.

Some help-with terms don't read after "help with", and are written differently:

| Term | Written as |
|---|---|
| Suicide | "suicidal thoughts" |
| Sex Offenders, Those at Risk of Sexual(ly) Offending | "a risk of sexual offending" |
| Workplace Counselling | "problems at work" |
| Parents | "parenting" |
| Online Counselling, Telephone Counselling | a Type of Session: "online", "by phone" |
| EMDR | a type of therapy: "I'm particularly interested in EMDR." |

The profile narrows two parts, chips and words alike, and adds one question:

- Types of therapy and session types are kept to those the therapist offers. A profile listing no session types (7 of 36, §3) keeps the searched ones, as UKCP matched them.
- Languages likewise, to those the profile lists.
- "what your fees are" is asked only where no office on the profile shows a fee.

When the message mentions suicidal thoughts, the site's help-now line (`HelpNow`) shows beneath the message, as a reply may be days away.

### 4.4 Editing

The site writes the draft until the visitor types in the subject or message. From then on the text is theirs: the chips and the two fields fold away (`Unfold`), so nothing can rewrite it, and in their place "Start again from your search" offers to replace it. That asks first, in an alert dialog, as it discards their edits.

Their text is saved with the therapist's entry as they type, as notes are (statuses §4.7: after a pause in typing, on close and as the page hides), so it is there when the drafter next opens, from the tab or the profile. A draft never edited is not stored, and is written afresh on opening, picking up a changed name or profile.

### 4.5 Sending

**Open in email app** follows a `mailto:` link to the therapist's address, with the subject and message percent-encoded and line breaks as `%0D%0A`. Some email apps cut a link longer than about 2,000 characters, so a longer one also copies the message and says so ("Also copied, in case your email app cuts it short.").

**Copy message** puts the subject and message on the clipboard and says "Copied." in a polite region. Where the clipboard is refused, the message is selected and the line says to press Ctrl+C (⌘C on a Mac).

Without an email address (8 of 36, §3), the open button gives way to a line saying what UKCP has instead, with the details as links: a phone number ("The message works as notes for the call."), a website, or none ("UKCP shows no way to reach {first name}."), with "View on UKCP" after. Copy stays.

After either button, or a followed phone link, the drafter asks "Mark as contacted?" with the profile's `ContactOffer` (statuses §4.5). "Yes" marks them contacted and closes the drafter; the track's button goes with the status, so focus moves to the track's next step. "Not now" leaves the drafter open.

### 4.6 What the profile adds

The drafter reads the therapist's profile and contact details through the same queries the profile page uses, so opening it from the profile costs nothing, and from the tab costs what opening the profile would. Until they arrive the message shows a skeleton. If the profile can't be read, the message is written from the card and the search alone (no narrowing, the fee question asked) with the failure line and "Try again" the profile uses.

### 4.7 What is stored

- On each entry: `search`, the query of the search the therapist was shortlisted from (`toQuery`, without its page), and `draft`, `{ subject, message }` once edited (§4.4).
- On the record: `sender`, `{ name, free }`, the visitor's two fields.

A bookmark passes the search it was pressed beside: the search on screen for a result card, the search the profile was opened from for a profile's, as does the profile's "Yes" to having got in touch with someone not yet shortlisted. One pressed with no search beneath stores none. Adding someone back keeps their draft, as it keeps their note, and takes the newer search where one is given.

The drafter reads the entry's search, else (for those shortlisted before this) the search on the page beneath, else none, which leaves the chips out and the message with its fixed parts.

The clear dialog and the About card name drafts with notes ("with your notes, drafts and where you stand with them"), and the About card adds the name and free times.

## 5. Accessibility

- The chips are checkboxes in a group named "Mention", each named by its label. Ticked shows a check as well as a fill, so it holds in forced colours.
- The subject and message are labelled fields; the message notes "Saved as you type, in this browser only.", as notes do.
- "Copied." and the long-link line are said in a polite region; the help-now line, when it appears, is not announced, as it isn't urgent.
- Focus starts on the first chip, or on the message once the text is the visitor's. Escape closes the drafter and returns focus to its button.
- The drafter stays off paper.

## 6. Testing

- The message: each filter's words and chip, unticking, the rewordings, lower-casing, "a" and "an", outward codes, narrowing by the profile, the fee question, a missing profile, no search, blank fields.
- The store: the new fields saved and read back, kept on adding back, cleared with the list, and a version-1 record without them.
- The bookmarks: each stores the search beneath it, or none.
- The drafter: the button only at "To contact" on a listed card; ticks and fields rewriting the draft until it is edited, then folding; Start again; a saved draft restored; the `mailto:` link's encoding; copying, with a long link and a refused clipboard; no email, phone only and no details; the offer, and focus after "Yes".

## 7. Delivery

A stack of three PRs:

1. **Store and found-by search** (§4.7): the new fields, the bookmarks passing their search, and the About card naming the found-by search.
2. **The message** (§4.3): a pure function from the profile, card, search, ticks and the visitor's fields to the chips, subject and message, with its tests. Nothing draws it yet.
3. **The drafter** (§4.1, §4.2, §4.4–§4.6): the track's button, the dialog, editing and saving, sending and the offer, and the clear dialog and About card naming drafts, as each PR deploys on its own.
