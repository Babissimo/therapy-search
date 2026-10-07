import { Info } from "lucide-react";
import { Link, matchPath, useLocation } from "react-router";
import { BackButton } from "@/components/BackButton";
import { DrawerClose, RouteDrawer } from "@/components/RouteDrawer";
import { backgroundOf, useDrawerLink } from "@/lib/drawerRoute";
import { useTitle } from "@/lib/useTitle";
import { ABOUT_PATH } from "@/site";
import { AboutText } from "./AboutText";

const HEADING = "About this site";

/**
 * Beside the site's name, the way to About: its icon and word where the masthead has room for both beside the theme switch,
 * wider on a touch screen, and elsewhere, as on a phone or atop the results panel, the icon alone.
 */
export function AboutLink() {
  const location = useLocation();
  const link = useDrawerLink();
  // On About's own page, it names the page shown rather than opening About over itself.
  const here = matchPath(ABOUT_PATH, location.pathname) !== null && backgroundOf(location) === undefined;
  return (
    <Link
      {...link(ABOUT_PATH)}
      aria-current={here ? "page" : undefined}
      onClick={(event) => {
        // A plain click only, so a click that asks for a new tab or window still gets one.
        if (here && !(event.metaKey || event.ctrlKey || event.shiftKey || event.altKey)) event.preventDefault();
      }}
      className="relative flex shrink-0 items-center gap-1.5 rounded-md text-sm text-muted-foreground touch-target outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 aria-[current=page]:text-foreground print:hidden"
    >
      <Info aria-hidden className="size-4 shrink-0" />
      {/* Parted by a space of the link's own, as each part of a name is read trimmed; a flex box draws it as nothing. */}
      <span className="@max-[22rem]/masthead:sr-only pointer-coarse:@max-[25rem]/masthead:sr-only">About</span>{" "}
      <span className="sr-only">this site</span>
    </Link>
  );
}

/** About opened over a page, in a drawer narrower than a profile's, as it holds a single column of reading, set as on a page. */
export function AboutDrawer({ open }: { open: boolean }) {
  useTitle(HEADING, open);
  return (
    <RouteDrawer open={open} label={HEADING} className="text-base data-[side=right]:sm:max-w-xl">
      <div className="px-6 pb-8 print:pb-0">
        {/* In the drawer's colour, so text scrolling beneath it stays hidden, and reaching a little past the text either side,
            over the rings focused links draw outside their boxes. As a profile's header does, it sticks only on a screen at
            least 30rem tall, and heads the first page on paper. */}
        <header className="top-0 z-10 -mx-1 bg-popover px-1 not-print:[@media(min-height:30rem)]:sticky">
          <div className="flex items-center justify-between gap-4 border-b py-3">
            <h1 className="font-heading text-2xl font-medium">{HEADING}</h1>
            {/* Pulls the icon out to the text's right edge, past the ghost button's padding. */}
            <div className="-mr-2 flex print:hidden">
              <DrawerClose />
            </div>
          </div>
        </header>
        <div className="pt-4">
          <AboutText />
        </div>
      </div>
    </RouteDrawer>
  );
}

/** About reached directly, as a page of its own. */
export function AboutPage() {
  useTitle(HEADING);
  return (
    <article className="space-y-4">
      <BackButton label="Back" />
      <h1 className="font-heading text-3xl font-medium">{HEADING}</h1>
      <AboutText />
    </article>
  );
}
