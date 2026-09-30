import { SlidersHorizontal } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** What a view asks for before it has anything to search, in large type in place of its results, with a line on how. */
export function Prompt({ ask, children, className }: { ask: ReactNode; children: ReactNode; className?: string }) {
  return (
    <div className={cn("space-y-4 text-center text-balance sm:space-y-6", className)}>
      <p className="font-heading text-3xl font-medium sm:text-4xl">{ask}</p>
      <p className="text-lg text-muted-foreground sm:text-xl">{children}</p>
    </div>
  );
}

/** The Filters button's icon, set in running text. */
export function FiltersIcon() {
  return <SlidersHorizontal aria-hidden className="inline size-[0.9em] align-[-0.1em]" />;
}
