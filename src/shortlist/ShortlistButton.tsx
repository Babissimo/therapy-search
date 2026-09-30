import { Bookmark } from "lucide-react";
import { useState } from "react";
import { IconButton } from "@/components/IconButton";
import { cn } from "@/lib/utils";
import type { ShortlistCard } from "./store";
import { useShortlistEntry, useShortlistStore } from "./useShortlist";

type Props = {
  therapist: ShortlistCard;
  className?: string;
};

/** Named for the therapist, as UKCP's is, since a list of cards has one on each. */
export function ShortlistButton({ therapist, className }: Props) {
  const store = useShortlistStore();
  const entry = useShortlistEntry(therapist.slug);
  // Kept once they are removed, so adding them back returns their place and card.
  const [kept, setKept] = useState(entry);
  if (entry && entry !== kept) setKept(entry);
  return (
    <IconButton
      label={entry ? `Remove ${therapist.name} from your shortlist` : `Add ${therapist.name} to your shortlist`}
      variant="ghost"
      size="icon-sm"
      className={className}
      onClick={() => (entry ? store.remove(therapist.slug) : store.add(kept?.card ?? therapist, kept?.addedAt))}
    >
      <Bookmark aria-hidden className={cn(entry && "fill-current")} />
    </IconButton>
  );
}
