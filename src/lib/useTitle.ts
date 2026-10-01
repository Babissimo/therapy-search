import { useEffect, useState } from "react";

/** The site's name, which ends every page's title, and is index.html's own. */
export const SITE_NAME = "Find a UKCP therapist (unofficial)";

type Claim = { title?: string };

// In the order their views mounted, so the one opened last, such as a profile's drawer over a search, names the page.
const claims: Claim[] = [];

function show() {
  const title = claims.findLast((claim) => claim.title !== undefined)?.title;
  document.title = title === undefined ? SITE_NAME : `${title} - ${SITE_NAME}`;
}

/** Names the page, ahead of the site's name, while the calling view is mounted. Undefined leaves it to the views beneath. */
export function useTitle(title: string | undefined) {
  const [claim] = useState<Claim>({});
  useEffect(() => {
    claims.push(claim);
    return () => {
      const at = claims.indexOf(claim);
      if (at >= 0) claims.splice(at, 1);
      show();
    };
  }, [claim]);
  useEffect(() => {
    claim.title = title;
    show();
  }, [claim, title]);
}
