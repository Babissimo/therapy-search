import { Bookmark } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { TherapistCard } from "@/search/TherapistCard";
import { ShortlistButton } from "./ShortlistButton";
import type { Shortlist } from "./store";
import { therapistCount, useShortlist } from "./useShortlist";

/** The shortlist beside the search's results. `sought` is the search's terms, which pick out tags as they do in the results. */
export function ShortlistTab({ sought }: { sought: ReadonlySet<string> }) {
  const shortlist = useShortlist();
  const shown = useShown(shortlist);
  const listed = new Set(shortlist.map((entry) => entry.card.slug));
  if (shown.length === 0) {
    return (
      <div className="flex gap-3 py-2">
        <Bookmark aria-hidden className="mt-0.5 size-5 shrink-0 text-muted-foreground" />
        <p className="text-sm">Nothing shortlisted yet. The bookmark on a therapist's card or profile keeps them here, in this browser only.</p>
      </div>
    );
  }
  return (
    <div className="space-y-4">
      {shortlist.length > 0 && <p className="text-sm text-muted-foreground">{therapistCount(shortlist.length)}, kept in this browser only.</p>}
      <ul className="space-y-4">
        {shown.map(({ card }) => (
          <li key={card.slug} className={cn("transition-opacity", !listed.has(card.slug) && "opacity-60")}>
            <TherapistCard therapist={card} sought={sought} action={<ShortlistButton therapist={card} />} />
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Everyone shortlisted while the tab is open, so a therapist removed here stays in place, ready to be added back. */
function useShown(shortlist: Shortlist): Shortlist {
  const [shown, setShown] = useState(shortlist);
  const [seen, setSeen] = useState(shortlist);
  if (seen !== shortlist) {
    setSeen(shortlist);
    const current = new Set(shortlist.map((entry) => entry.card.slug));
    const removed = shown.filter((entry) => !current.has(entry.card.slug));
    setShown([...shortlist, ...removed].sort((a, b) => b.addedAt - a.addedAt));
  }
  return shown;
}
