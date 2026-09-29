import { useState } from "react";
import { useNavigate } from "react-router";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { ProfileBody } from "./ProfilePage";

/** A profile opened from the search, in a drawer over it; closing it goes back to the search, just as it was. */
export function ProfileDrawer({ slug }: { slug: string }) {
  const navigate = useNavigate();
  // The card or pin that opened it. The drawer has no trigger of its own, which is where the dialog would send focus back.
  const [opener] = useState(() => document.activeElement);
  return (
    <Sheet open onOpenChange={(open) => !open && navigate(-1)}>
      <SheetContent
        side="right"
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
        <div className="px-6 pt-12 pb-8">
          <ProfileBody slug={slug} />
        </div>
      </SheetContent>
    </Sheet>
  );
}
