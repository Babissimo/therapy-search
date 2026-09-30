import { useState } from "react";
import { XIcon } from "lucide-react";
import { useNavigate } from "react-router";
import { Button } from "@/components/ui/button";
import { Sheet, SheetClose, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { ProfileBody } from "./ProfilePage";

/**
 * A profile opened from the search, in a drawer over it; closing it goes back to the search, just as it was. Going back
 * any other way closes it too, as `open` follows the history.
 */
export function ProfileDrawer({ slug, open }: { slug: string; open: boolean }) {
  const navigate = useNavigate();
  // The card or pin that opened it. The drawer has no trigger of its own, which is where the dialog would send focus back.
  const [opener] = useState(() => document.activeElement);
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
        className="overflow-y-auto data-[side=right]:w-full data-[side=right]:sm:max-w-2xl"
      >
        <SheetHeader className="sr-only">
          <SheetTitle>Therapist profile</SheetTitle>
        </SheetHeader>
        <div className="px-6 pb-8">
          <ProfileBody slug={slug} close={close} />
        </div>
      </SheetContent>
    </Sheet>
  );
}
