import type { ReactNode } from "react";
import { Link, useMatch } from "react-router";
import { cn } from "@/lib/utils";
import { Disclaimer } from "./Disclaimer";
import { ThemeSwitch } from "./ThemeSwitch";

export function SiteLayout({ children }: { children: ReactNode }) {
  // The search page is a map filling the window below the header, its results ending with the disclaimer;
  // other pages read as documents with a footer.
  const fill = useMatch("/") !== null;
  return (
    <div className={cn("flex flex-col", fill ? "h-svh" : "min-h-svh")}>
      <header className="border-b">
        <div className={cn("flex items-center justify-between px-4 py-4", !fill && "mx-auto max-w-6xl")}>
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
      {fill ? (
        <main className="flex min-h-0 flex-1 flex-col">{children}</main>
      ) : (
        <>
          <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">{children}</main>
          <footer className="border-t">
            <Disclaimer className="mx-auto max-w-6xl px-4 py-6" />
          </footer>
        </>
      )}
    </div>
  );
}
