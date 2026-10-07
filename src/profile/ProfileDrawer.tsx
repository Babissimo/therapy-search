import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Maximize2, Minimize2 } from "lucide-react";
import { IconButton } from "@/components/IconButton";
import { DrawerClose, RouteDrawer } from "@/components/RouteDrawer";
import { browserStorage } from "@/lib/storage";
import { useTitle } from "@/lib/useTitle";
import { ProfileBody, profileQuery } from "./ProfilePage";

/** Set while the visitor wants drawers to fill the window, as each then opens doing. */
const EXPANDED_KEY = "profile-expanded";

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

/** A profile opened from the search, in a drawer over it. */
export function ProfileDrawer({ slug, open }: { slug: string; open: boolean }) {
  const [expanded, setExpanded] = useState(storedExpanded);
  // The drawer, and the page while it is open, take the therapist's name once their profile is in.
  const name = useQuery(profileQuery(slug)).data?.name;
  useTitle(name, open);
  // The drawer's buttons live in the profile's header, which stays in view as the drawer scrolls on all but a short screen.
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
      <DrawerClose />
    </>
  );
  return (
    <RouteDrawer
      open={open}
      // Named without heading it a second time, as the profile's name heads it once the profile is in.
      label={name ?? "Therapist profile"}
      data-expanded={expanded || undefined}
      className="data-[side=right]:sm:max-w-2xl data-expanded:data-[side=right]:md:max-w-full motion-safe:transition-[max-width]"
    >
      {/* Filling the window, the profile keeps to the width of its own page. */}
      <div className="mx-auto w-full max-w-6xl px-6 pb-8 print:pb-0">
        <ProfileBody slug={slug} close={corner} />
      </div>
    </RouteDrawer>
  );
}
