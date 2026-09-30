import { Morph } from "@/components/Morph";
import { cn } from "@/lib/utils";
import { SiteTitle } from "./SiteTitle";
import { ThemeSwitch } from "./ThemeSwitch";

/** The site's name beside the theme switch: atop the results on the search page, and atop other pages. */
export function Masthead({ title, className }: { title?: "h1" | "p"; className?: string }) {
  return (
    <div className={cn("flex items-center justify-between gap-2", className)}>
      <Morph name="site-title">
        <SiteTitle as={title} />
      </Morph>
      <Morph name="theme-switch">
        <ThemeSwitch />
      </Morph>
    </div>
  );
}
