import { Morph } from "@/components/Morph";
import { cn } from "@/lib/utils";
import { AboutLink } from "./About";
import { ThemeSwitch } from "./ThemeSwitch";

/**
 * The site's name, with the way to About beside it, and the theme switch: atop the results on the search page, and atop
 * other pages. The name links nowhere, as the search page it would lead to is the one it heads.
 */
export function Masthead({ title: Title = "h1", className }: { title?: "h1" | "p"; className?: string }) {
  return (
    // Measured, so the way to About names itself in words only where it leaves the site's name a line of its own.
    <div className={cn("@container/masthead flex items-center justify-between gap-2", className)}>
      <Morph name="site-title">
        <div className="flex min-w-0 items-center gap-1.5 @min-[22rem]/masthead:gap-3">
          <Title className="min-w-0 font-heading text-lg font-medium">Find a UKCP therapist</Title>
          <AboutLink />
        </div>
      </Morph>
      <Morph name="theme-switch">
        <ThemeSwitch />
      </Morph>
    </div>
  );
}
