import { useEffect, useState } from "react";

/** The site's name, which ends every page's title, and is index.html's own. */
export const SITE_NAME = "Find a UKCP therapist (unofficial)";

type Claim = { title?: string };

// In the order their views became active, so the one opened last, such as a profile's drawer over a search, names the page.
const claims: Claim[] = [];

function show() {
  const title = claims.findLast((claim) => claim.title !== undefined)?.title;
  document.title = title === undefined ? SITE_NAME : `${title} - ${SITE_NAME}`;
}

/**
 * Names the page, ahead of the site's name, while the calling view is mounted and `active`. Undefined leaves it to the
 * views beneath. A view kept mounted while shut, such as the profile's drawer, passes `active` so that it claims the page
 * afresh as it opens, over views beneath that were drawn again meanwhile.
 */
export function useTitle(title: string | undefined, active = true) {
  const [claim] = useState<Claim>({});
  useEffect(() => {
    if (!active) return;
    claims.push(claim);
    show();
    return () => {
      const at = claims.indexOf(claim);
      if (at >= 0) claims.splice(at, 1);
      show();
    };
  }, [claim, active]);
  useEffect(() => {
    claim.title = title;
    show();
  }, [claim, title]);
}
