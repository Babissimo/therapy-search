import type { ReactNode } from "react";
import { Link } from "react-router";
import { ThemeSwitch } from "./ThemeSwitch";

export function SiteLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-svh flex-col">
      <header className="border-b">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4">
          <Link to="/" className="font-semibold">
            Find a UKCP therapist
          </Link>
          <div className="flex items-center gap-4">
            <Link to="/about" className="text-sm text-muted-foreground hover:underline">
              About<span className="max-sm:hidden"> this site</span>
            </Link>
            <ThemeSwitch />
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">{children}</main>
      <footer className="border-t">
        <p className="mx-auto max-w-6xl px-4 py-6 text-sm text-muted-foreground">
          An unofficial front end for the{" "}
          <a className="underline" href="https://www.psychotherapy.org.uk/find-a-therapist/">
            UK Council for Psychotherapy's directory
          </a>
          . Not affiliated with or endorsed by UKCP. Every listing comes from UKCP's site.
        </p>
      </footer>
    </div>
  );
}
