import { useState, type ComponentProps } from "react";
import { XIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetClose, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { useCloseDrawer } from "@/lib/drawerRoute";
import { cn } from "@/lib/utils";

/** On <html> while a drawer is in the page. */
const PRINTS_ALONE = "data-print-alone-shown";
/** The drawers in the page, which may overlap as one slides away and the next opens. */
let drawers = 0;

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

type Props = Omit<ComponentProps<typeof SheetContent>, "side" | "showCloseButton"> & {
  open: boolean;
  /** Names the drawer without heading it, as the page it holds heads itself. */
  label: string;
};

/**
 * A page opened over another, such as a profile from the search, in a drawer to the right that fills a phone's screen;
 * closing it goes back to the page beneath, just as it was. Going back any other way closes it too, as `open` follows
 * the history.
 */
export function RouteDrawer({ open, label, className, children, ...props }: Props) {
  const closeDrawer = useCloseDrawer();
  // What opened it. The drawer has no trigger of its own, which is where the dialog would send focus back.
  const [opener] = useState(() => document.activeElement);
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
        // Printed, what it holds is the whole of what comes out, at its full length (see index.css).
        data-print-alone
        ref={markPage}
        className={cn("overflow-y-auto data-[side=right]:w-full", className)}
        {...props}
      >
        <SheetTitle hidden>{label}</SheetTitle>
        {children}
      </SheetContent>
    </Sheet>
  );
}

/** The drawer's way out, for the page it holds to place in its header. */
export function DrawerClose() {
  return (
    <SheetClose asChild>
      <Button variant="ghost" size="icon-sm">
        <XIcon />
        <span className="sr-only">Close</span>
      </Button>
    </SheetClose>
  );
}
