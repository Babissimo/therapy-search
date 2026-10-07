import { Link } from "react-router";
import { REMOVED_DAYS } from "@/shortlist/store";
import { CONTACT_URL, STATEMENT_PATH } from "@/site";
import { LIST, Section } from "./Document";
import { HelpNow } from "./HelpNow";

/**
 * What the site is, in words a reading age of nine can follow, then where to turn for help today, and beneath them how
 * it treats UKCP, the geocoders and visitors, set for reading beneath the heading of the drawer or page it is in.
 */
export function AboutText() {
  return (
    <div className="max-w-reading space-y-8 leading-relaxed">
      <div className="space-y-4">
        <p>This site helps you find a therapist in the UK. It shows therapists from UKCP's list, but UKCP does not run this site.</p>
        <HelpNow />
      </div>
      <Section heading="How it works">
        <p>
          This site is an unofficial, simpler way to search the{" "}
          <a className="underline" href="https://www.psychotherapy.org.uk/find-a-therapist/">
            UK Council for Psychotherapy's therapist directory
          </a>
          , and is not affiliated with or endorsed by UKCP.
        </p>
        <p>
          Searches and profiles come from UKCP's site as needed, including profiles read for each card's office, to pin it and show its fee.
          Nothing is copied into a database here. To spare UKCP's servers, each visitor is rate-limited and answers are reused: searches for
          15 minutes (online ones for 6 hours), profiles for an hour and offices' postcodes and fees for 30 days.
        </p>
      </Section>
      <Section heading="Who sees what">
        <ul className={LIST}>
          <li>
            Your browser keeps your shortlist (with where you stand with each therapist and your notes on them), your theme, whether profiles open full width, a random number
            that holds results in the same order and, until you close the tab, the search you last opened a profile or this text from, and shares none of
            them. Anyone you remove from your shortlist is kept in case you add them
            back, until you clear it or open this site {REMOVED_DAYS} days or more after removing them.
          </li>
          <li>
            Cloudflare hosts the site and logs your IP address, but never alongside your searches or the profiles you open. It also serves
            postcodes.io, so what this site asks postcodes.io is logged there.
          </li>
          <li>UKCP sees your IP address and whose photos you're shown, as photos load straight from its site.</li>
          <li>CARTO sees your IP address and the area of map you view, as your browser fetches its map tiles.</li>
          <li>postcodes.io and OpenStreetMap place therapists on the map. This site asks them for you, so they never see your IP address.</li>
        </ul>
        <p>"Use my location" rounds your position to about 100 metres before it leaves your browser, then searches the nearest postcode.</p>
      </Section>
      <div className="space-y-4">
        <p>
          If you're from UKCP, or have any concern about this site,{" "}
          <a className="underline" href={CONTACT_URL}>
            get in touch
          </a>
          .
        </p>
        <p>
          <Link className="underline" to={STATEMENT_PATH}>
            Accessibility statement
          </Link>
          : what works, what doesn't yet, and how to report a problem.
        </p>
        <p className="text-sm text-muted-foreground">
          <a className="underline" href="https://postcodes.io">
            postcodes.io
          </a>{" "}
          contains Ordnance Survey, Royal Mail and ONS data under the Open Government Licence.
        </p>
      </div>
    </div>
  );
}
