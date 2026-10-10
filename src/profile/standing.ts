import { useLayoutEffect, useRef, useState } from "react";
import { STATUS_LABEL } from "@/shortlist/status";
import type { ShortlistCard, Status } from "@/shortlist/store";
import { useShortlistAnnouncement, useShortlistStatus, useShortlistStore } from "@/shortlist/useShortlist";

/**
 * Where the visitor stands with a profile's therapist, with the offer to mark them contacted once a phone or email link is
 * followed, what a screen reader hears as that changes, and where focus goes as the track and the offer do. `search` is kept
 * with a therapist the offer shortlists.
 */
export function useStanding(slug: string, search?: string) {
  const store = useShortlistStore();
  const status = useShortlistStatus(slug);
  const unmarked = status === undefined || status === "maybe" || status === "toContact";
  const [offered, setOffered] = useState(false);
  // Marked another way, by the track or in another tab, they need no asking.
  if (offered && !unmarked) setOffered(false);
  const [announcement, announce] = useShortlistAnnouncement();
  const root = useRef<HTMLElement>(null);
  // The phone or email link followed, which takes focus back once the offer is answered.
  const followed = useRef<HTMLElement | null>(null);
  // Set when the track's menu takes the therapist off, for the bookmark that can put them back to take focus once the track has gone.
  const toBookmark = useRef(false);
  useLayoutEffect(() => {
    if (!toBookmark.current) return;
    toBookmark.current = false;
    root.current?.querySelector<HTMLElement>(`[data-bookmark="${window.CSS.escape(slug)}"]`)?.focus();
  });

  const chosen = (therapist: ShortlistCard, to: Status) => announce(`${therapist.name}: ${STATUS_LABEL[to]}.`);

  return {
    /** The profile, in which the bookmark is found. */
    root,
    status,
    /** For the profile's polite live region. */
    announcement,
    /** Whether to ask if they got in touch. */
    offering: offered,
    /** After the track gives the therapist a new status. */
    chosen,
    /** After the track's menu takes the therapist off the shortlist. */
    removed: (therapist: ShortlistCard) => {
      announce(`Removed ${therapist.name} from your shortlist.`);
      toBookmark.current = true;
    },
    /**
     * After the visitor follows a phone or email link: asks whether they got in touch, while the therapist is a maybe, to contact
     * or not shortlisted.
     */
    reached: (link: HTMLElement) => {
      if (!unmarked) return;
      followed.current = link;
      setOffered(true);
    },
    /** "Yes" marks the therapist contacted, shortlisting them first where they aren't, and says so. */
    answered: (therapist: ShortlistCard, yes: boolean) => {
      if (yes) {
        if (store.has(slug)) {
          store.setStatus(slug, "contacted");
          chosen(therapist, "contacted");
        } else {
          store.add(therapist, { status: "contacted", search });
          announce(`${therapist.name}: ${STATUS_LABEL.contacted}, and added to your shortlist.`);
        }
      }
      setOffered(false);
      followed.current?.focus();
    },
  };
}
