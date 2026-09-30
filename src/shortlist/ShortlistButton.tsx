import { Bookmark } from "lucide-react";
import { IconButton } from "@/components/IconButton";
import { cn } from "@/lib/utils";
import type { ShortlistCard } from "./store";
import { useShortlisted, useShortlistStore } from "./useShortlist";

type Props = {
  therapist: ShortlistCard;
  /** When the therapist was first added, so adding them back returns them to their place in the list. */
  addedAt?: number;
  className?: string;
};

/** Named for the therapist, as UKCP's is, since a list of cards has one on each. */
export function ShortlistButton({ therapist, addedAt, className }: Props) {
  const store = useShortlistStore();
  const listed = useShortlisted(therapist.slug);
  return (
    <IconButton
      label={listed ? `Remove ${therapist.name} from your shortlist` : `Add ${therapist.name} to your shortlist`}
      variant="ghost"
      size="icon-sm"
      className={className}
      onClick={() => (listed ? store.remove(therapist.slug) : store.add(therapist, addedAt))}
    >
      <Bookmark aria-hidden className={cn(listed && "fill-current")} />
    </IconButton>
  );
}
