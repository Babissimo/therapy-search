import { ArrowDown } from "lucide-react";
import type { ReactNode, Ref } from "react";
import { Button } from "@/components/ui/button";
import { HelpNow } from "@/layout/HelpNow";
import { cn } from "@/lib/utils";
import { LanguagesShortcut } from "./LanguagesShortcut";

type Props = {
  ask: ReactNode;
  children: ReactNode;
  /** Makes the ask and its line one focusable block apart from the rest, for a view to send the keyboard to. */
  askRef?: Ref<HTMLDivElement>;
  /** Offers a button down to the filters, for a phone, where they follow the prompt out of sight below it. */
  toFilters?: boolean;
  className?: string;
};

/**
 * What a view asks for before it has anything to search, in large type in place of its results, with a line on how, a
 * way down to the filters where they come beneath it, a way straight to the languages among them, and, smaller, where to
 * turn for help today.
 */
export function Prompt({ ask, children, askRef, toFilters = false, className }: Props) {
  return (
    <div className={cn("space-y-4 text-center text-balance sm:space-y-6", className)}>
      <div ref={askRef} tabIndex={askRef ? -1 : undefined} data-prompt-ask={askRef ? "" : undefined} className="space-y-4 outline-none sm:space-y-6">
        <p className="font-heading text-3xl font-medium sm:text-4xl">{ask}</p>
        <p className="text-lg text-muted-foreground sm:text-xl">{children}</p>
      </div>
      {toFilters && (
        <Button type="button" className="h-11 px-5 text-base has-data-[icon=inline-end]:pr-4" onClick={showFilters}>
          Start your search
          <ArrowDown data-icon="inline-end" aria-hidden />
        </Button>
      )}
      <LanguagesShortcut />
      <HelpNow className="pt-4 text-muted-foreground sm:pt-6" />
    </div>
  );
}

/** Glides the page down to the filters, taking the keyboard to their first group, as the skip link to them does on wide screens. */
function showFilters() {
  const filters = document.querySelector<HTMLElement>("[data-filter-panel]");
  const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  filters?.scrollIntoView({ behavior: still ? "auto" : "smooth", block: "start" });
  filters?.querySelector<HTMLElement>('[data-slot="accordion-trigger"]')?.focus({ preventScroll: true });
}
