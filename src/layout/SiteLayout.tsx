import type { ReactNode } from "react";
import { matchPath, useLocation } from "react-router";
import { backgroundOf } from "@/lib/drawerRoute";
import { ONLINE_PATH } from "@/search/online";
import { Masthead } from "./Masthead";

export function SiteLayout({ children }: { children: ReactNode }) {
  // The search page, near a place or online, fills the window, with the site's name atop its results; other pages read
  // as documents with it in a header. A profile's drawer leaves the page beneath it as it was. Paper has no window to fill,
  // so the open list runs on over as many pages as it needs.
  const location = useLocation();
  const { pathname } = backgroundOf(location) ?? location;
  const fill = matchPath("/", pathname) !== null || matchPath(ONLINE_PATH, pathname) !== null;
  if (fill) return <main className="flex h-svh flex-col print:block print:h-auto">{children}</main>;
  return (
    <>
      <header className="border-b">
        <Masthead title="p" className="mx-auto max-w-6xl px-4 py-3" />
      </header>
      <main className="mx-auto w-full max-w-6xl px-4 py-8 print:pb-0">{children}</main>
    </>
  );
}
