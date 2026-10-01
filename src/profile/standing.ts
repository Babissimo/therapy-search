import { useLayoutEffect, useRef, useState } from "react";
import { STATUS_LABEL } from "@/shortlist/status";
import type { ShortlistCard, Status } from "@/shortlist/store";
import { useShortlistStatus } from "@/shortlist/useShortlist";

/** Where the visitor stands with a profile's therapist, what a screen reader hears as that changes, and where focus goes as the track does. */
export function useStanding(slug: string) {
  const status = useShortlistStatus(slug);
  const [announcement, setAnnouncement] = useState("");
  const root = useRef<HTMLElement>(null);
  // Set when the track's menu takes the therapist off, for the bookmark that can put them back to take focus once the track has gone.
  const toBookmark = useRef(false);
  useLayoutEffect(() => {
    if (!toBookmark.current) return;
    toBookmark.current = false;
    root.current?.querySelector<HTMLElement>(`[data-bookmark="${window.CSS.escape(slug)}"]`)?.focus();
  });

  return {
    /** The profile, in which the bookmark is found. */
    root,
    status,
    /** For the profile's polite live region. */
    announcement,
    /** After the track gives the therapist a new status. */
    chosen: (therapist: ShortlistCard, to: Status) => setAnnouncement(`${therapist.name}: ${STATUS_LABEL[to]}.`),
    /** After the track's menu takes the therapist off the shortlist. */
    removed: () => void (toBookmark.current = true),
  };
}
