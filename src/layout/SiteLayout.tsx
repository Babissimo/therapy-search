import type { ReactNode } from "react";
import { matchPath, useLocation } from "react-router";
import { backgroundOf } from "@/profile/profileLink";
import { Masthead } from "./Masthead";

export function SiteLayout({ children }: { children: ReactNode }) {
  // The search page is a map filling the window, with the site's name atop its results; other pages read as documents
  // with it in a header. A profile's drawer leaves the page beneath it as it was.
  const location = useLocation();
  const fill = matchPath("/", (backgroundOf(location) ?? location).pathname) !== null;
  if (fill) return <main className="flex h-svh flex-col">{children}</main>;
  return (
    <>
      <header className="border-b">
        <Masthead title="p" className="mx-auto max-w-6xl px-4 py-3" />
      </header>
      <main className="mx-auto w-full max-w-6xl px-4 py-8">{children}</main>
    </>
  );
}
