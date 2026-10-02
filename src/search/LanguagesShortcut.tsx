import { Languages } from "lucide-react";
import { flushSync } from "react-dom";
import { Button } from "@/components/ui/button";
import { focusOnceShown } from "@/layout/SkipLinks";
import { FILTER_GROUPS } from "./filterGroups";

/** UKCP's name for its languages group, which FilterPanel marks the group's item with. */
const LANGUAGES = "Languages";

/**
 * A way straight to the languages filter, which UKCP lists late among its groups though it is the first question for
 * someone who wants a therapist in their own language. It opens the group among the filters on the page, and takes the
 * keyboard to the group's search box. Ticks made there wait in the draft like any other.
 */
export function LanguagesShortcut() {
  if (!FILTER_GROUPS.some((group) => group.label === LANGUAGES)) return null;
  return (
    // Inline, so the icon keeps to the first line's words as a narrow screen wraps them.
    <Button type="button" variant="link" className="inline h-auto px-0 text-base whitespace-normal underline sm:text-lg" onClick={openLanguages}>
      <Languages aria-hidden className="mr-1.5 inline size-5 align-[-0.25em]" />
      Find a therapist who speaks your language
    </Button>
  );
}

function openLanguages() {
  const group = document.querySelector<HTMLElement>(`[data-filter-group="${LANGUAGES}"]`);
  const trigger = group?.querySelector<HTMLElement>('[data-slot="accordion-trigger"]');
  // Drawn at once, so its search box is there to take the keyboard.
  if (trigger?.getAttribute("aria-expanded") === "false") flushSync(() => trigger.click());
  focusOnceShown(() => group?.querySelector<HTMLElement>('input[type="search"]'));
}
