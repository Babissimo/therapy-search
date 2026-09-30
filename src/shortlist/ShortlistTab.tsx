import { Bookmark } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { pinsBySlug, type Pin } from "@/search/map/pins";
import { TherapistCard } from "@/search/TherapistCard";
import { ShortlistButton } from "./ShortlistButton";
import type { Shortlist } from "./store";
import { therapistCount, useShortlist } from "./useShortlist";

type Props = {
  /** The search's terms, which pick out tags as they do in the results. */
  sought: ReadonlySet<string>;
  /** The shortlist's pins, while the map shows them. */
  pins?: Pin[];
  /** How many shortlisted therapists the map can't place, while it shows them. */
  unplaced?: number;
  /** The pin last activated on the map, whose therapists are marked. */
  selected?: Pin;
  /** The therapist whose card the pointer or focus is on, for the map to ring their pin. */
  onHighlight?: (slug: string | undefined) => void;
};

/** The shortlist beside the search's results. */
export function ShortlistTab({ sought, pins = [], unplaced = 0, selected, onHighlight }: Props) {
  const shortlist = useShortlist();
  const shown = useShown(shortlist);
  const listed = new Set(shortlist.map((entry) => entry.card.slug));
  const pinOf = pinsBySlug(pins);
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
      {shortlist.length > 0 && (
        <p className="text-sm text-muted-foreground">
          {therapistCount(shortlist.length)}, kept in this browser only{unplaced > 0 && ` · ${unplaced} not on the map`}.
        </p>
      )}
      <ul className="space-y-4">
        {shown.map(({ card }) => {
          const pinKey = pinOf.get(card.slug)?.key;
          const marked = pinKey !== undefined && pinKey === selected?.key;
          return (
            // Marked by pin, so the page can bring a selected pin's therapists into view.
            <li
              key={card.slug}
              data-pin={pinKey}
              aria-current={marked || undefined}
              className={cn("rounded-xl transition-opacity", !listed.has(card.slug) && "opacity-60", marked && "ring-2 ring-sky-500")}
            >
              <TherapistCard
                therapist={card}
                sought={sought}
                action={<ShortlistButton therapist={card} />}
                onHighlight={(on) => onHighlight?.(on ? card.slug : undefined)}
              />
            </li>
          );
        })}
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
