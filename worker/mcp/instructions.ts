/** The site's help-now line as plain text, in HelpNow's words, which ErrorBoundary.test.tsx holds it to. */
export const HELP_NOW =
  "Need help now? In the UK, call 111 and choose the mental health option (in Northern Ireland, Lifeline on 0808 808 8000), " +
  "Samaritans on 116 123, or text SHOUT to 85258. In an emergency, call 999.";

/** What an assistant is told of the server before it uses it. */
export const INSTRUCTIONS = [
  "This server searches the UK Council for Psychotherapy's (UKCP) public register of psychotherapists and psychotherapeutic counsellors, " +
    "through an unofficial site that UKCP does not run.",
  `It is a directory, not a support service. If someone may be at risk now, give them this first: ${HELP_NOW}`,
  "Put what someone describes into UKCP's own terms, which the tools list (grief is Bereavement), and choose few: UKCP lists only " +
    "therapists who chose every issue, type of therapy, group and language given.",
  "Contact details aren't given here. They're on each therapist's profile on the site, which the results link to.",
  "Searches pass through the site to UKCP; the site keeps no record of who asked what. What someone tells you is seen by you and your " +
    "provider; say so if they ask.",
].join("\n\n");
