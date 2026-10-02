import { Bookmark } from "lucide-react";
import { IconButton } from "@/components/IconButton";
import { cn } from "@/lib/utils";
import type { ShortlistCard } from "./store";
import { useShortlistAnnouncement, useShortlisted, useShortlistStore } from "./useShortlist";

type Props = { therapist: ShortlistCard; className?: string };

/** Named for the therapist, as UKCP's is, since a list of cards has one on each. */
export function ShortlistButton({ therapist, className }: Props) {
  const store = useShortlistStore();
  const listed = useShortlisted(therapist.slug);
  const [announcement, announce] = useShortlistAnnouncement();

  function toggle() {
    if (listed) {
      store.remove(therapist.slug);
      return announce(`Removed ${therapist.name} from your shortlist.`);
    }
    // The store puts back anyone it kept as removed where and as they were.
    store.add(therapist);
    announce(`Added ${therapist.name} to your shortlist.`);
  }

  return (
    <>
      <IconButton
        label={listed ? `Remove ${therapist.name} from your shortlist` : `Add ${therapist.name} to your shortlist`}
        variant="ghost"
        size="icon-sm"
        className={className}
        // Marked by slug, for a list to give it focus once a menu has taken the therapist off.
        data-bookmark={therapist.slug}
        onClick={toggle}
      >
        <Bookmark aria-hidden className={cn(listed && "fill-current")} />
      </IconButton>
      {/* Focus stays on the button, whose new name is seldom read out, so the press is said here. */}
      <span aria-live="polite" className="sr-only">
        {announcement}
      </span>
    </>
  );
}
