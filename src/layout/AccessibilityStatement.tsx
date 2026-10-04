import { useEffect, useRef, type ReactNode } from "react";
import { UKCP_ORIGIN } from "@shared/query";
import { BackButton } from "@/components/BackButton";
import { useTitle } from "@/lib/useTitle";
import { REPORT_URL } from "@/site";

/** When the site was last tested, which found the problems listed. */
const TESTED_ON = "1 October 2026";

/** A product's name, which a browser translating the page would otherwise turn into an ordinary word. */
function Name({ children }: { children: string }) {
  return <span translate="no">{children}</span>;
}

/** What testing found not to work well, the most harmful first. Each goes once it is fixed. */
export const KNOWN_PROBLEMS: ReactNode[] = [
  <>
    Older browsers, such as <Name>Safari</Name> on an iPad that can't update past <Name>iPadOS</Name> 15, and browsers with
    JavaScript turned off, can't run the full search. They're offered the <a className="underline" href="/plain">plain search</a>{" "}
    instead, which has no map, shortlist or notes.
  </>,
  <>
    On a touch screen, Filters and Use my location show their names, but some buttons, such as Hide list, the bookmark and the
    status menu, still show only an icon.
  </>,
  "A screen reader can hear a search's count twice: first for the nearest few therapists, then for all of them.",
  "On a profile, if contact details fail to load, pressing Try again loses the keyboard's place.",
  "If you ask your device for less motion while a map is showing, the map keeps moving until you reload the page.",
];

/**
 * How well the site works for disabled visitors, what doesn't yet, and how to say so, after GOV.UK's sample statement.
 * `followed` is whether a link led here, rather than Back, a reload or the visit beginning here.
 */
export function AccessibilityStatement({ followed = false }: { followed?: boolean }) {
  useTitle("Accessibility statement");
  const heading = useRef<HTMLHeadingElement>(null);
  // The About card's link leaves with the card, and the keyboard with it, so it starts again at the heading, at the top.
  useEffect(() => {
    if (!followed) return;
    window.scrollTo({ top: 0 });
    heading.current?.focus({ preventScroll: true });
  }, [followed]);
  return (
    <article className="max-w-reading space-y-8 leading-relaxed">
      <div className="space-y-4">
        <BackButton label="Back" />
        <h1 ref={heading} tabIndex={-1} className="rounded-sm font-heading text-3xl font-medium">
          Accessibility statement
        </h1>
        <p>We want everyone who needs a therapist to be able to use this site. You should be able to:</p>
        <ul className={LIST}>
          <li>use it with a keyboard alone</li>
          <li>zoom in, or use a narrow screen, without scrolling sideways</li>
          <li>choose a light or dark theme, or follow your device's</li>
          <li>ask your device for less motion, and have the site keep still</li>
          <li>translate the page in your browser, which leaves names and places as they are</li>
          <li>search without JavaScript, or in an older browser, with a plain search</li>
          <li>find where to turn for help today, and UKCP's own directory, even when the search won't load</li>
        </ul>
        <p>
          <a className="underline" href="https://mcmw.abilitynet.org.uk/">
            <Name>AbilityNet</Name> has advice
          </a>{" "}
          on making your device easier to use if you have a disability.
        </p>
      </div>

      <Section heading="What doesn't work well yet">
        <p>When we tested the site on {TESTED_ON}, we found these problems. We take each off this list once it is fixed.</p>
        <ul className={LIST}>
          {KNOWN_PROBLEMS.map((problem, i) => (
            <li key={i}>{problem}</li>
          ))}
        </ul>
      </Section>

      <Section heading="Reporting a problem">
        <p>If something here is hard to use, or doesn't work for you, please tell us. We read every report.</p>
        <p>
          <a className="underline" href={REPORT_URL}>
            Report a problem on <Name>GitHub</Name>
          </a>
          . You need a free <Name>GitHub</Name> account. What you write there is public, and shows your{" "}
          <Name>GitHub</Name> name, so please leave out anything personal, such as your health or where you live.
        </p>
        <p>
          Meanwhile, UKCP's own directory lists the same therapists:{" "}
          <a className="underline" href={`${UKCP_ORIGIN}/find-a-therapist/`}>
            find a therapist on the UKCP website
          </a>
          .
        </p>
      </Section>

      <Section heading="How we tested it">
        <p>
          On {TESTED_ON} we checked the site against the Web Content Accessibility Guidelines (WCAG) 2.2, at level AA. We read
          its code, and ran automated checks and tests in <Name>Chrome</Name> that covered:
        </p>
        <ul className={LIST}>
          <li>moving through each page with the keyboard</li>
          <li>zooming in to 400%, and screens 320 pixels wide</li>
          <li>
            <Name>Windows</Name> contrast themes
          </li>
          <li>reduced motion</li>
          <li>slow connections</li>
          <li>JavaScript turned off</li>
          <li>printing</li>
          <li>touch screens</li>
          <li>machine translation, simulated</li>
        </ul>
        <p>
          We haven't yet tested the site with people who use screen readers or other assistive technology, or with{" "}
          <Name>JAWS</Name>, <Name>NVDA</Name>, <Name>VoiceOver</Name>, <Name>TalkBack</Name> or <Name>Dragon</Name>. Nor have
          we tried it in <Name>Firefox</Name> or <Name>Safari</Name>, or on older phones and tablets.
        </p>
        <p>The site partly meets WCAG 2.2 at level AA. Some of the problems above are where it falls short.</p>
      </Section>

      <Section heading="About this statement">
        <p>
          Public bodies in the UK must publish a statement like this. This site isn't one: it is unofficial and volunteer-run,
          so it doesn't have to. We publish one anyway, so you know what works, what doesn't yet, and that we want to hear
          about problems.
        </p>
        <p>This statement was prepared on 1 October 2026.</p>
      </Section>
    </article>
  );
}

const LIST = "list-disc space-y-1.5 pl-5";

function Section({ heading, children }: { heading: string; children: ReactNode }) {
  return (
    <section className="space-y-4">
      <h2 className="font-heading text-xl font-medium">{heading}</h2>
      {children}
    </section>
  );
}
