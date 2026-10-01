import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { XIcon } from "lucide-react";
import { useNavigate } from "react-router";
import { Button } from "@/components/ui/button";
import { Sheet, SheetClose, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { useTitle } from "@/lib/useTitle";
import { ProfileBody, profileQuery } from "./ProfilePage";

/**
 * A profile opened from the search, in a drawer over it; closing it goes back to the search, just as it was. Going back
 * any other way closes it too, as `open` follows the history.
 */
export function ProfileDrawer({ slug, open }: { slug: string; open: boolean }) {
  const navigate = useNavigate();
  // The card or pin that opened it. The drawer has no trigger of its own, which is where the dialog would send focus back.
  const [opener] = useState(() => document.activeElement);
  // The drawer, and the page while it is open, take the therapist's name once their profile is in.
  const name = useQuery(profileQuery(slug)).data?.name;
  useTitle(open ? name : undefined);
  // The close button lives in the profile's header, which stays in view as the drawer scrolls.
  const close = (
    <SheetClose asChild>
      <Button variant="ghost" size="icon-sm">
        <XIcon />
        <span className="sr-only">Close</span>
      </Button>
    </SheetClose>
  );
  return (
    // Once closed, it can still be dismissed as it slides away, which must not go back a second time.
    <Sheet open={open} onOpenChange={(next) => !next && open && navigate(-1)}>
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
        className="overflow-y-auto data-[side=right]:w-full data-[side=right]:sm:max-w-2xl"
      >
        {/* Names the drawer without heading it a second time, as the profile's name heads it once the profile is in. */}
        <SheetTitle hidden>{name ?? "Therapist profile"}</SheetTitle>
        <div className="px-6 pb-8 print:pb-0">
          <ProfileBody slug={slug} close={close} />
        </div>
      </SheetContent>
    </Sheet>
  );
}
