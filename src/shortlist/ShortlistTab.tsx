import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type Announcements,
  type DragEndEvent,
  type Modifier,
  type UniqueIdentifier,
} from "@dnd-kit/core";
import { arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Bookmark, GripVertical } from "lucide-react";
import { useRef, useState } from "react";
import { IconButton } from "@/components/IconButton";
import { cn } from "@/lib/utils";
import { pinsBySlug, type Pin } from "@/search/map/pins";
import { TherapistCard } from "@/search/TherapistCard";
import { ShortlistButton } from "./ShortlistButton";
import { byRank, type Shortlist, type ShortlistCard } from "./store";
import { useShortlist, useShortlistStore } from "./useShortlist";

type Props = {
  /** The search's terms, which pick out tags as they do in the results. */
  sought: ReadonlySet<string>;
  /** Beside a list of therapists met online or by phone, drawing its cards as that list does. */
  online?: boolean;
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
export function ShortlistTab({ sought, online = false, pins = [], unplaced = 0, selected, onHighlight }: Props) {
  const store = useShortlistStore();
  const shortlist = useShortlist();
  const shown = useShown(shortlist);
  const listed = new Set(shortlist.map((entry) => entry.card.slug));
  const pinOf = pinsBySlug(pins);
  const slugs = shown.map((entry) => entry.card.slug);
  const indexOf = (id: UniqueIdentifier) => slugs.indexOf(String(id));
  const announcements = useAnnouncements(shown, indexOf);
  const sensors = useSensors(
    // A press on the handle that barely moves isn't a drag, so a stray click announces no pick-up and put-down.
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  if (shown.length === 0) {
    return (
      <div className="flex gap-3 py-2">
        <Bookmark aria-hidden className="mt-0.5 size-5 shrink-0 text-muted-foreground" />
        <p className="text-sm">Nothing shortlisted yet. The bookmark on a therapist's card or profile keeps them here, in this browser only.</p>
      </div>
    );
  }

  // Neighbours come from everyone shown, a therapist removed here included, so they keep their place too.
  function onDragEnd({ active, over }: DragEndEvent) {
    const from = indexOf(active.id);
    const to = over ? indexOf(over.id) : -1;
    if (to === -1 || to === from) return;
    const order = arrayMove([...shown], from, to);
    store.move(String(active.id), { above: order[to - 1], below: order[to + 1] });
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">Kept in this browser only{unplaced > 0 && ` · ${unplaced} not on the map`}.</p>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        modifiers={[upOrDown]}
        onDragEnd={onDragEnd}
        accessibility={{ announcements, screenReaderInstructions: { draggable: INSTRUCTIONS } }}
      >
        <SortableContext items={slugs} strategy={verticalListSortingStrategy}>
          <ul className="space-y-4">
            {shown.map(({ card }) => {
              const pinKey = pinOf.get(card.slug)?.key;
              return (
                <SortableEntry
                  key={card.slug}
                  card={card}
                  listed={listed.has(card.slug)}
                  sought={sought}
                  online={online}
                  pinKey={pinKey}
                  marked={pinKey !== undefined && pinKey === selected?.key}
                  onHighlight={onHighlight}
                />
              );
            })}
          </ul>
        </SortableContext>
      </DndContext>
    </div>
  );
}

type EntryProps = {
  card: ShortlistCard;
  listed: boolean;
  sought: ReadonlySet<string>;
  online: boolean;
  pinKey?: string;
  /** At the pin selected on the map. */
  marked: boolean;
  onHighlight?: (slug: string | undefined) => void;
};

/** A card with a handle to move it by; a therapist removed here can't be moved until they are added back. */
function SortableEntry({ card, listed, sought, online, pinKey, marked, onHighlight }: EntryProps) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({
    id: card.slug,
    disabled: { draggable: !listed },
  });
  return (
    // Marked by pin, so the page can bring a selected pin's therapists into view.
    <li
      ref={setNodeRef}
      data-pin={pinKey}
      aria-current={marked || undefined}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={cn(
        "flex items-center gap-1 transition-opacity",
        !listed && "opacity-60",
        // Carried over its neighbours, lifted off the list.
        isDragging && "relative z-10 [&_[data-slot=card]]:shadow-lg",
      )}
    >
      <IconButton
        ref={setActivatorNodeRef}
        label={`Move ${card.name}`}
        side="right"
        variant="ghost"
        size="icon-sm"
        // Only the handle takes a touch as a drag, so the list still scrolls under a finger elsewhere.
        className="cursor-grab touch-none text-muted-foreground active:cursor-grabbing"
        disabled={!listed}
        {...attributes}
        {...listeners}
      >
        <GripVertical aria-hidden />
      </IconButton>
      <div className={cn("min-w-0 flex-1 rounded-xl", marked && "ring-2 ring-highlight")}>
        <TherapistCard
          therapist={card}
          sought={sought}
          online={online}
          action={<ShortlistButton therapist={card} />}
          onHighlight={(on) => onHighlight?.(on ? card.slug : undefined)}
        />
      </div>
    </li>
  );
}

const upOrDown: Modifier = ({ transform }) => ({ ...transform, x: 0 });

const INSTRUCTIONS =
  "To move a therapist, press space or enter to pick them up, the up and down arrows to move them, and space or enter again to put them down. Escape puts them back.";

/** What a screen reader hears as a therapist is moved, by name and by number, where dnd-kit's own would read out the slug. */
function useAnnouncements(shown: Shortlist, indexOf: (id: UniqueIdentifier) => number): Announcements {
  // A pick-up is at once over the therapist's own place, which the pick-up has announced already.
  const pickedUp = useRef(false);
  const name = (id: UniqueIdentifier) => shown[indexOf(id)]!.card.name;
  const place = (id: UniqueIdentifier) => `number ${indexOf(id) + 1} of ${shown.length}`;
  return {
    onDragStart: ({ active }) => {
      pickedUp.current = true;
      return `Picked up ${name(active.id)}, ${place(active.id)}.`;
    },
    onDragOver: ({ active, over }) => {
      const first = pickedUp.current;
      pickedUp.current = false;
      if (!over || (first && over.id === active.id)) return undefined;
      return `${name(active.id)} moved to ${place(over.id)}.`;
    },
    onDragEnd: ({ active, over }) => (over ? `${name(active.id)} put down at ${place(over.id)}.` : `${name(active.id)} put back.`),
    onDragCancel: ({ active }) => `${name(active.id)} put back at ${place(active.id)}.`,
  };
}

/** Everyone shortlisted while the tab is open, so a therapist removed here stays in place, ready to be added back. */
function useShown(shortlist: Shortlist): Shortlist {
  const [shown, setShown] = useState(shortlist);
  const [seen, setSeen] = useState(shortlist);
  if (seen !== shortlist) {
    setSeen(shortlist);
    const current = new Set(shortlist.map((entry) => entry.card.slug));
    const removed = shown.filter((entry) => !current.has(entry.card.slug));
    setShown([...shortlist, ...removed].sort(byRank));
  }
  return shown;
}
