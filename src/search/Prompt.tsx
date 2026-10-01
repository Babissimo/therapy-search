import { SlidersHorizontal } from "lucide-react";
import type { ReactNode } from "react";
import { HelpNow } from "@/layout/HelpNow";
import { cn } from "@/lib/utils";

/**
 * What a view asks for before it has anything to search, in large type in place of its results, with a line on how and,
 * smaller, where to turn for help today.
 */
export function Prompt({ ask, children, className }: { ask: ReactNode; children: ReactNode; className?: string }) {
  return (
    <div className={cn("space-y-4 text-center text-balance sm:space-y-6", className)}>
      <p className="font-heading text-3xl font-medium sm:text-4xl">{ask}</p>
      <p className="text-lg text-muted-foreground sm:text-xl">{children}</p>
      <HelpNow className="pt-4 text-muted-foreground sm:pt-6" />
    </div>
  );
}

/** The Filters button's icon, set in running text. */
export function FiltersIcon() {
  return <SlidersHorizontal aria-hidden className="inline size-[0.9em] align-[-0.1em]" />;
}
