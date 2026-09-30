import { CONTACT_URL } from "@/site";

/** What the site is and how it treats UKCP, the geocoders and visitors, shown from the site's name. */
export function AboutText() {
  return (
    <>
      <p>
        This is an unofficial, simpler page for searching the{" "}
        <a className="underline" href="https://www.psychotherapy.org.uk/find-a-therapist/">
          UK Council for Psychotherapy's therapist directory
        </a>
        . It is not run by, affiliated with or endorsed by UKCP.
      </p>
      <p>
        Every search and profile is fetched from UKCP's own site when you ask for it, and shown as UKCP returns it. Nothing is copied into a
        database here. Identical searches are reused for 15 minutes and profiles for an hour, so that repeated visits don't add load to UKCP's
        servers, and each visitor's requests are rate-limited.
      </p>
      <p>
        Cloudflare, which hosts this site, records the address of each request along with your IP address, so your search is never put in
        one: it travels inside the request, and sits after the # in the page's address, which your browser doesn't send. When this site has no
        stored answer and asks OpenStreetMap about a place, or UKCP for a profile, Cloudflare records that request too, with the place or
        profile in its address and your internet provider and country, but not your IP address. Therapists' photos load straight from UKCP,
        so UKCP sees your IP address and whose photos are shown.
      </p>
      <p>
        Your browser keeps your shortlist, your choice of light or dark theme if you pick one, and one random number that holds results in
        the same order when you come back to a search. None of these is sent to this site or to UKCP.
      </p>
      <p>
        The map's tiles come from CARTO, with map data from OpenStreetMap contributors. Your browser fetches them directly, so CARTO sees the
        area you're looking at, but not your search. Therapists' locations are placed using{" "}
        <a className="underline" href="https://postcodes.io">
          postcodes.io
        </a>{" "}
        (which contains Ordnance Survey, Royal Mail and ONS data under the Open Government Licence) and OpenStreetMap's Nominatim. This site
        asks them on your behalf, so they never see your IP address, and each answer is reused for every visitor.
      </p>
      <p>
        "Use my location" asks your browser for your position, which it shares only if you allow it. The page rounds it to about 100 metres
        before this site asks postcodes.io for the nearest postcode, which is then searched, and shown in the page's address, like one you
        typed.
      </p>
      <p>
        If you're from UKCP, or have any concern about this site,{" "}
        <a className="underline" href={CONTACT_URL}>
          get in touch
        </a>
        .
      </p>
    </>
  );
}
