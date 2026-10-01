import { Bookmark } from "lucide-react";
import { useState } from "react";
import { IconButton } from "@/components/IconButton";
import { cn } from "@/lib/utils";
import type { ShortlistCard, ShortlistEntry } from "./store";
import { useShortlistEntry, useShortlistStore } from "./useShortlist";

type Props = {
  therapist: ShortlistCard;
  /** The entry a list still shows for a therapist removed before this button mounted, so it can add them back as they were. */
  kept?: ShortlistEntry;
  className?: string;
};

/** Named for the therapist, as UKCP's is, since a list of cards has one on each. */
export function ShortlistButton({ therapist, kept, className }: Props) {
  const store = useShortlistStore();
  const entry = useShortlistEntry(therapist.slug);
  // Held once they are removed, so adding them back returns their place, status and card, unless the list was cleared
  // since; the count of clears is read rather than watched, so a button redraws for its own therapist alone.
  const [last, setLast] = useState(() => ({ entry: entry ?? kept, clears: store.clears() }));
  if (entry && entry !== last.entry) setLast({ entry, clears: store.clears() });

  function toggle() {
    if (entry) return store.remove(therapist.slug);
    const place = last.clears === store.clears() ? last.entry : undefined;
    store.add(place?.card ?? therapist, place);
  }

  return (
    <IconButton
      label={entry ? `Remove ${therapist.name} from your shortlist` : `Add ${therapist.name} to your shortlist`}
      variant="ghost"
      size="icon-sm"
      className={className}
      // Marked by slug, for a list to give it focus once a menu has taken the therapist off.
      data-bookmark={therapist.slug}
      onClick={toggle}
    >
      <Bookmark aria-hidden className={cn(entry && "fill-current")} />
    </IconButton>
  );
}
