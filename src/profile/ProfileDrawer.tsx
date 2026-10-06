import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Maximize2, Minimize2, XIcon } from "lucide-react";
import { IconButton } from "@/components/IconButton";
import { Button } from "@/components/ui/button";
import { Sheet, SheetClose, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { browserStorage } from "@/lib/storage";
import { useTitle } from "@/lib/useTitle";
import { ProfileBody, profileQuery } from "./ProfilePage";
import { useCloseDrawer } from "./profileLink";

/** On <html> while a drawer is in the page. */
const PRINTS_ALONE = "data-print-alone-shown";
/** The drawers in the page, which may overlap as one slides away and the next opens. */
let drawers = 0;

/** Set while the visitor wants drawers to fill the window, as each then opens doing. */
const EXPANDED_KEY = "profile-expanded";

/**
 * Marks the page for as long as a drawer is in it, sliding away included, for print to leave out all but the drawer
 * (index.css), which a browser without :has can't find for itself.
 */
function markPage(drawer: HTMLElement | null) {
  if (!drawer) return;
  drawers++;
  document.documentElement.setAttribute(PRINTS_ALONE, "");
  return () => {
    if (--drawers === 0) document.documentElement.removeAttribute(PRINTS_ALONE);
  };
}

function storedExpanded(): boolean {
  try {
    return browserStorage()?.getItem(EXPANDED_KEY) === "true";
  } catch {
    return false;
  }
}

function storeExpanded(expanded: boolean) {
  try {
    if (expanded) browserStorage()?.setItem(EXPANDED_KEY, "true");
    else browserStorage()?.removeItem(EXPANDED_KEY);
  } catch {
    // Private browsing can refuse writes; the choice then lasts for this drawer only.
  }
}

/**
 * A profile opened from the search, in a drawer over it; closing it goes back to the search, just as it was. Going back
 * any other way closes it too, as `open` follows the history.
 */
export function ProfileDrawer({ slug, open }: { slug: string; open: boolean }) {
  const closeDrawer = useCloseDrawer();
  // The card or pin that opened it. The drawer has no trigger of its own, which is where the dialog would send focus back.
  const [opener] = useState(() => document.activeElement);
  const [expanded, setExpanded] = useState(storedExpanded);
  // The drawer, and the page while it is open, take the therapist's name once their profile is in.
  const name = useQuery(profileQuery(slug)).data?.name;
  useTitle(name, open);
  // The drawer's buttons live in the profile's header, which stays in view as the drawer scrolls.
  const corner = (
    <>
      {/* Shown, like the expansion it makes, only where the drawer leaves room beside it: narrower windows it all but fills. */}
      <IconButton
        label={expanded ? "Shrink to the side" : "Expand to full width"}
        variant="ghost"
        size="icon-sm"
        className="max-md:hidden"
        onClick={() => {
          setExpanded(!expanded);
          storeExpanded(!expanded);
        }}
      >
        {expanded ? <Minimize2 aria-hidden /> : <Maximize2 aria-hidden />}
      </IconButton>
      <SheetClose asChild>
        <Button variant="ghost" size="icon-sm">
          <XIcon />
          <span className="sr-only">Close</span>
        </Button>
      </SheetClose>
    </>
  );
  return (
    // Once closed, it can still be dismissed as it slides away, which must not go back a second time.
    <Sheet open={open} onOpenChange={(next) => !next && open && closeDrawer()}>
      <SheetContent
        side="right"
        showCloseButton={false}
        aria-describedby={undefined}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          if (opener instanceof HTMLElement) opener.focus();
        }}
        // Printed, the profile is the whole of what comes out, at its full length (see index.css).
        data-print-alone
        data-expanded={expanded || undefined}
        ref={markPage}
        className="overflow-y-auto data-[side=right]:w-full data-[side=right]:sm:max-w-2xl data-expanded:data-[side=right]:md:max-w-full motion-safe:transition-[max-width]"
      >
        {/* Names the drawer without heading it a second time, as the profile's name heads it once the profile is in. */}
        <SheetTitle hidden>{name ?? "Therapist profile"}</SheetTitle>
        {/* Filling the window, the profile keeps to the width of its own page. */}
        <div className="mx-auto w-full max-w-6xl px-6 pb-8 print:pb-0">
          <ProfileBody slug={slug} close={corner} />
        </div>
      </SheetContent>
    </Sheet>
  );
}
