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
import { Bookmark, ChevronRight, GripVertical } from "lucide-react";
import { useId, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { IconButton } from "@/components/IconButton";
import { cn } from "@/lib/utils";
import { pinsBySlug, type Pin } from "@/search/map/pins";
import { TherapistCard } from "@/search/TherapistCard";
import { CountBadge } from "./CountBadge";
import { useClosedGroups } from "./groups";
import { ShortlistButton } from "./ShortlistButton";
import { STATUS_ICON, STATUS_LABEL } from "./status";
import { StatusMenu } from "./StatusMenu";
import { byRank, STATUSES, statusOf, type Shortlist, type ShortlistCard, type Status } from "./store";
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

/** Those shown with one status, in the shortlist's order. */
type Group = { status: Status; entries: Shortlist };

/** The shortlist beside the search's results, grouped by where the visitor stands with each therapist. */
export function ShortlistTab({ sought, online = false, pins = [], unplaced = 0, selected, onHighlight }: Props) {
  const store = useShortlistStore();
  const shortlist = useShortlist();
  const shown = useShown(shortlist);
  const [closed, toggle] = useClosedGroups();
  // The group a drag began in, whose therapists alone it can be dropped among.
  const [dragging, setDragging] = useState<Status>();
  const [announcement, setAnnouncement] = useState("");
  const root = useRef<HTMLDivElement>(null);
  // What takes focus once the list has redrawn, when what had it has moved or gone.
  const refocus = useRef<string | undefined>(undefined);
  useLayoutEffect(() => {
    const selector = refocus.current;
    refocus.current = undefined;
    if (selector) root.current?.querySelector<HTMLElement>(selector)?.focus();
  });
  const listed = new Set(shortlist.map((entry) => entry.card.slug));
  const pinOf = pinsBySlug(pins);
  const groups: Group[] = STATUSES.map((status) => ({ status, entries: shown.filter((entry) => statusOf(entry) === status) })).filter(
    (group) => group.entries.length > 0,
  );
  const groupOf = (id: UniqueIdentifier) => groups.find((group) => group.entries.some((entry) => entry.card.slug === id));
  const announcements = useAnnouncements(groupOf);
  const sensors = useSensors(
    // A press on the handle that barely moves isn't a drag, so a stray click announces no pick-up and put-down.
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  if (shown.length === 0) {
    return (
      <div className="flex gap-3 py-2 fade-in-0 motion-safe:animate-in">
        <Bookmark aria-hidden className="mt-0.5 size-5 shrink-0 text-muted-foreground" />
        <p className="text-sm">
          Bookmark anyone who might suit you, from their card or profile, to compare them here, then mark where you stand with each as you
          get in touch. It's fine to contact a few before choosing one. Your shortlist is kept in this browser only.
        </p>
      </div>
    );
  }

  // The therapist goes beside their new neighbour in the group and in the shortlist's whole order alike, so they keep a
  // place among everyone for when their status changes. A therapist removed here counts as a neighbour, keeping theirs.
  function onDragEnd({ active, over }: DragEndEvent) {
    setDragging(undefined);
    const entries = groupOf(active.id)?.entries ?? [];
    const slugs = entries.map((entry) => entry.card.slug);
    const from = slugs.indexOf(String(active.id));
    const to = over ? slugs.indexOf(String(over.id)) : -1;
    if (to === -1 || to === from) return;
    const order = arrayMove([...entries], from, to);
    const others = shown.filter((entry) => entry.card.slug !== active.id);
    const above = order[to - 1];
    const below = order[to + 1];
    store.move(String(active.id), above ? { above, below: others[others.indexOf(above) + 1] } : { above: others[others.indexOf(below!) - 1], below });
  }

  // Their row has left for another group, so focus follows it there, or to the group's heading while it is closed.
  function movedTo(therapist: ShortlistCard, status: Status) {
    refocus.current = closed.has(status) ? `[data-group-toggle="${status}"]` : `[data-status-menu="${window.CSS.escape(therapist.slug)}"]`;
    setAnnouncement(`${therapist.name} moved to ${STATUS_LABEL[status]}.`);
  }

  // Their menu went with them, so focus goes to the bookmark that can put them back.
  function removed(therapist: ShortlistCard) {
    refocus.current = `[data-bookmark="${window.CSS.escape(therapist.slug)}"]`;
  }

  return (
    <div ref={root} className="space-y-4 fade-in-0 motion-safe:animate-in">
      <p className="text-sm text-muted-foreground">Kept in this browser only{unplaced > 0 && ` · ${unplaced} not on the map`}.</p>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        modifiers={[upOrDown]}
        onDragStart={({ active }) => setDragging(groupOf(active.id)?.status)}
        onDragEnd={onDragEnd}
        onDragCancel={() => setDragging(undefined)}
        accessibility={{ announcements, screenReaderInstructions: { draggable: INSTRUCTIONS } }}
      >
        {groups.map(({ status, entries }) => (
          <GroupSection
            key={status}
            status={status}
            count={entries.filter((entry) => listed.has(entry.card.slug)).length}
            open={!closed.has(status)}
            onToggle={() => toggle(status)}
          >
            <SortableContext
              id={status}
              items={entries.map((entry) => entry.card.slug)}
              strategy={verticalListSortingStrategy}
              // Other groups take no drop, which keeps pointer and keyboard alike within the group a drag began in.
              disabled={{ droppable: dragging !== undefined && dragging !== status }}
            >
              <ul className="space-y-4">
                {entries.map(({ card }) => {
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
                      onChosen={(chosen) => movedTo(card, chosen)}
                      onRemoved={() => removed(card)}
                    />
                  );
                })}
              </ul>
            </SortableContext>
          </GroupSection>
        ))}
      </DndContext>
      <p aria-live="polite" className="sr-only">
        {announcement}
      </p>
    </div>
  );
}

type GroupProps = { status: Status; count: number; open: boolean; onToggle: () => void; children: ReactNode };

/** A status's therapists under a heading that opens and closes them. */
function GroupSection({ status, count, open, onToggle, children }: GroupProps) {
  const listId = useId();
  const Icon = STATUS_ICON[status];
  return (
    <section className="space-y-2">
      <h2>
        {/* Marked by status, for the list to give it focus when a therapist is sent to the group while it is closed. */}
        <button
          type="button"
          data-group-toggle={status}
          aria-expanded={open}
          aria-controls={listId}
          onClick={onToggle}
          className="flex w-full items-center gap-2 rounded-md py-1 text-left text-sm font-medium outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <ChevronRight aria-hidden className={cn("size-4 shrink-0 text-muted-foreground motion-safe:transition-transform", open && "rotate-90")} />
          <Icon aria-hidden className="size-4 shrink-0 text-muted-foreground" />
          {STATUS_LABEL[status]}
          <CountBadge count={count} />
        </button>
      </h2>
      {open && (
        <div id={listId} className="fade-in-0 motion-safe:animate-in">
          {children}
        </div>
      )}
    </section>
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
  /** After the menu gives the therapist a new status. */
  onChosen: (status: Status) => void;
  /** After the menu takes the therapist off the shortlist. */
  onRemoved: () => void;
};

/** A card with a handle to move it by; a therapist removed here can't be moved until they are added back. */
function SortableEntry({ card, listed, sought, online, pinKey, marked, onHighlight, onChosen, onRemoved }: EntryProps) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({
    id: card.slug,
    disabled: { draggable: !listed },
  });
  // The callback holding this card's highlight, while it does: an unmounted card gets no blur or pointer-leave to give it up.
  const highlighting = useRef<EntryProps["onHighlight"]>(undefined);
  // A layout effect, so the highlight is given up before the list gives focus to the card's new place.
  useLayoutEffect(() => () => highlighting.current?.(undefined), []);
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
          heading="h3"
          action={
            <>
              <StatusMenu therapist={card} onChosen={onChosen} onRemoved={onRemoved} />
              <ShortlistButton therapist={card} />
            </>
          }
          onHighlight={(on) => {
            highlighting.current = on ? onHighlight : undefined;
            onHighlight?.(on ? card.slug : undefined);
          }}
        />
      </div>
    </li>
  );
}

const upOrDown: Modifier = ({ transform }) => ({ ...transform, x: 0 });

const INSTRUCTIONS =
  "To move a therapist, press space or enter to pick them up, the up and down arrows to move them within their group, and space or enter again to put them down. Escape puts them back.";

/** What a screen reader hears as a therapist is moved, by name and by number within their group, where dnd-kit's own would read out the slug. */
function useAnnouncements(groupOf: (id: UniqueIdentifier) => Group | undefined): Announcements {
  // A pick-up is at once over the therapist's own place, which the pick-up has announced already.
  const pickedUp = useRef(false);
  const find = (id: UniqueIdentifier) => {
    const entries = groupOf(id)?.entries ?? [];
    const index = entries.findIndex((entry) => entry.card.slug === id);
    return { name: entries[index]?.card.name ?? "", place: `number ${index + 1} of ${entries.length}` };
  };
  return {
    onDragStart: ({ active }) => {
      pickedUp.current = true;
      const { name, place } = find(active.id);
      return `Picked up ${name}, ${place}.`;
    },
    onDragOver: ({ active, over }) => {
      const first = pickedUp.current;
      pickedUp.current = false;
      if (!over || (first && over.id === active.id)) return undefined;
      return `${find(active.id).name} moved to ${find(over.id).place}.`;
    },
    onDragEnd: ({ active, over }) => (over ? `${find(active.id).name} put down at ${find(over.id).place}.` : `${find(active.id).name} put back.`),
    onDragCancel: ({ active }) => `${find(active.id).name} put back at ${find(active.id).place}.`,
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
