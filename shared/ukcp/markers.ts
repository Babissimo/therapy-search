// The classes that mark each kind of UKCP page, which the parsers start from and the Worker checks for before keeping a
// page. Kept apart from the parsers so the Worker, which has no DOM, imports nothing else of theirs.

/** The class of the header that marks a profile page: a therapist may have written no biography at all. */
export const PROFILE_HEADER = "therapist-header";

/** The classes that mark a results page: its count of results, or UKCP's notice when it has none. */
export const RESULTS_COUNT = "results-no";
export const RESULTS_NOTICE = "fat-search-alert";

/** The start of each contact detail's class (-tel, -email, -web), which a page without details never holds. */
export const CONTACT_DETAIL = "therapist-contacts-details-";
