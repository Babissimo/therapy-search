import { CONTACT_URL } from "@/site";
import { HelpNow } from "./HelpNow";

/** What the site is, where to turn for help today, and how it treats UKCP, the geocoders and visitors, shown from the site's name. */
export function AboutText() {
  return (
    <>
      <p>
        An unofficial, simpler way to search the{" "}
        <a className="underline" href="https://www.psychotherapy.org.uk/find-a-therapist/">
          UK Council for Psychotherapy's therapist directory
        </a>
        . It is not run by, affiliated with or endorsed by UKCP.
      </p>
      <HelpNow />
      <p>
        Searches and profiles come from UKCP's site as needed, including profiles read for each card's office, to pin it and show its fee.
        Nothing is copied into a database here. To spare UKCP's servers, each visitor is rate-limited and answers are reused: searches for
        15 minutes (online ones for 6 hours), profiles for an hour and offices' postcodes and fees for 30 days.
      </p>
      <h3 className="font-medium">Who sees what</h3>
      <ul className="list-disc space-y-1.5 pl-4">
        <li>
          Your browser keeps your shortlist, your theme and a random number that holds results in the same order, and shares none of them.
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
      <p>
        If you're from UKCP, or have any concern about this site,{" "}
        <a className="underline" href={CONTACT_URL}>
          get in touch
        </a>
        .
      </p>
      <p className="text-xs text-muted-foreground">
        <a className="underline" href="https://postcodes.io">
          postcodes.io
        </a>{" "}
        contains Ordnance Survey, Royal Mail and ONS data under the Open Government Licence.
      </p>
    </>
  );
}
