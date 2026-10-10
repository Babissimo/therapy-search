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
import { Bookmark, ChevronDown, ChevronRight, ChevronUp, GripVertical } from "lucide-react";
import { useId, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { flushSync } from "react-dom";
import { GLIDE } from "@/components/GlidingList";
import { IconButton } from "@/components/IconButton";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { crossFade } from "@/lib/crossFade";
import { useMediaQuery } from "@/lib/useMediaQuery";
import { cn } from "@/lib/utils";
import { feeLine, type Fee, type FeeKind } from "@/search/fee";
import { pinsBySlug, type Pin } from "@/search/map/pins";
import { TherapistCard } from "@/search/TherapistCard";
import { useOffices } from "@/search/useOffices";
import { CopyShortlist } from "./CopyShortlist";
import { CountBadge } from "./CountBadge";
import { useSetAsideOpen } from "./setAside";
import { ShortlistButton } from "./ShortlistButton";
import { PASSED_LABEL, STATUS_ICON, STATUS_LABEL } from "./status";
import { StatusTrack } from "./StatusTrack";
import { byRank, REMOVED_DAYS, statusOf, type Between, type Shortlist, type ShortlistCard, type ShortlistEntry, type Status } from "./store";
import { therapistCount, useShortlist, useShortlistAnnouncement, useShortlistClears, useShortlistRemoved, useShortlistStore } from "./useShortlist";

type Props = {
  /** The search's terms, which pick out tags as they do in the results. */
  sought: ReadonlySet<string>;
  /** The kinds of fee the search asks for, which the cards give as the results do. */
  feeKinds?: readonly FeeKind[];
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

/** The shortlist beside the search's results, in the visitor's order, with maybes gathered after it and those set aside at its foot. */
export function ShortlistTab({ sought, feeKinds = [], online = false, pins = [], unplaced = 0, selected, onHighlight }: Props) {
  const store = useShortlistStore();
  // Drawn before the callback returns, for the transition to see the page as the clear leaves it.
  const clear = () => crossFade(() => flushSync(store.clear));
  const shortlist = useShortlist();
  const shown = useShown(shortlist);
  const [setAsideOpen, toggleSetAside] = useSetAsideOpen();
  const list = shown.filter((entry) => sectionOf(statusOf(entry)) === "list");
  const maybes = shown.filter((entry) => statusOf(entry) === "maybe");
  const setAside = shown.filter((entry) => statusOf(entry) === "setAside");
  // A shortlist gathers therapists from any search, so their offices are asked about whatever this one is, while their cards show.
  const { officeOf } = useOffices([...list, ...maybes, ...(setAsideOpen ? setAside : [])].map((entry) => entry.card), true);
  const feeOf = (card: ShortlistCard) => {
    const office = officeOf(card);
    return office && feeLine(office.cost, feeKinds);
  };
  const [announcement, announce] = useShortlistAnnouncement();
  const root = useRef<HTMLDivElement>(null);
  // What takes focus once the list has redrawn, when what had it has moved or gone.
  const refocus = useRef<string | undefined>(undefined);
  useLayoutEffect(() => {
    const selector = refocus.current;
    refocus.current = undefined;
    if (selector) root.current?.querySelector<HTMLElement>(selector)?.focus();
  });
  // After the refocusing above, so a focus scrolls the tab to where a card lands, not where it glides from.
  const glide = useGlide(root);
  const empty = shown.length === 0;
  const removedCount = useShortlistRemoved();
  const note = useRef<HTMLDivElement>(null);
  // Once a clear, here or in another tab, leaves nothing to clear, focus left on nothing, as it is when it went with the
  // list's controls, goes to the note in their place.
  const clearable = !empty || removedCount > 0;
  const wasClearable = useRef(clearable);
  useLayoutEffect(() => {
    if (!clearable && wasClearable.current && document.activeElement === document.body) note.current?.focus();
    wasClearable.current = clearable;
  }, [clearable]);
  const listed = new Set(shortlist.map((entry) => entry.card.slug));
  const pinOf = pinsBySlug(pins);
  if (empty) {
    return (
      <div className="space-y-4 fade-in-0 motion-safe:animate-in">
        <div
          ref={note}
          tabIndex={-1}
          className="-mx-2 flex gap-3 rounded-md p-2 outline-none focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-hidden"
        >
          <Bookmark aria-hidden className="mt-0.5 size-5 shrink-0 text-muted-foreground" />
          <p className="text-sm">
            Bookmark anyone who might suit you, from their card or profile, to compare them here, then mark where you stand with each as you
            get in touch. It's fine to contact a few before choosing one. Your shortlist is kept in this browser only.
          </p>
        </div>
        {/* So a note left on someone removed can be forgotten without first shortlisting anyone. */}
        {removedCount > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 print:hidden">
            <p className="text-sm text-muted-foreground">
              {therapistCount(removedCount)} you removed {removedCount === 1 ? "is" : "are"} kept for {REMOVED_DAYS} days, in case you add them back.
            </p>
            <div className="-mr-2.5 ml-auto flex">
              <ClearShortlist listed={0} removed={removedCount} onClear={clear} />
            </div>
          </div>
        )}
      </div>
    );
  }

  // A card stays put unless its status takes it to another section, when focus follows it there, or to the "Set aside"
  // heading while that section is closed.
  function changed(therapist: ShortlistCard, from: Status, to: Status) {
    announce(`${therapist.name}: ${STATUS_LABEL[to]}.`);
    if (sectionOf(from) === sectionOf(to)) return;
    // Where each card stands before the list redraws, for it to glide from there.
    glide(therapist.slug);
    refocus.current = to === "setAside" && !setAsideOpen ? "[data-set-aside-toggle]" : `[data-status-menu="${window.CSS.escape(therapist.slug)}"]`;
  }

  // Their menu went with them, so focus goes to the bookmark that can put them back.
  function removed(therapist: ShortlistCard, said = `Removed ${therapist.name} from your shortlist.`) {
    announce(said);
    refocus.current = `[data-bookmark="${window.CSS.escape(therapist.slug)}"]`;
  }

  // Focus stays on the button pressed, which redrawing the list can take it from, or goes to the other once the therapist
  // reaches an end, where the one pressed is disabled.
  function moved(entries: Shortlist, from: number, to: number) {
    const { card } = entries[from]!;
    store.move(card.slug, between(entries, shown, from, to));
    announce(`${card.name} moved to number ${to + 1} of ${entries.length}.`);
    const up = to < from ? to > 0 : to === entries.length - 1;
    refocus.current = `[data-move-${up ? "up" : "down"}="${window.CSS.escape(card.slug)}"]`;
  }

  const cards = (entries: Shortlist, heading: "h2" | "h3") => (
    <SortableList entries={entries} shown={shown}>
      {entries.map((entry, i) => {
        const { card } = entry;
        const status = statusOf(entry);
        const pinKey = pinOf.get(card.slug)?.key;
        return (
          <SortableEntry
            key={card.slug}
            entry={entry}
            heading={heading}
            listed={listed.has(card.slug)}
            sought={sought}
            online={online}
            fee={feeOf(card)}
            pinKey={pinKey}
            marked={pinKey !== undefined && pinKey === selected?.key}
            onHighlight={onHighlight}
            onUp={i > 0 ? () => moved(entries, i, i - 1) : undefined}
            onDown={i < entries.length - 1 ? () => moved(entries, i, i + 1) : undefined}
            onChosen={(to) => changed(card, status, to)}
            onRemoved={() => removed(card)}
            onPassed={() => removed(card, `${card.name}: ${PASSED_LABEL}, and removed from your shortlist.`)}
          />
        );
      })}
    </SortableList>
  );

  return (
    <div ref={root} className="space-y-4 fade-in-0 motion-safe:animate-in">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 print:hidden">
        <p className="text-sm text-muted-foreground">Kept in this browser only{unplaced > 0 && ` · ${unplaced} not on the map`}.</p>
        {/* Pulled out to the cards' right edge, past the ghost buttons' padding, on a line of their own too. */}
        <div className="-mr-2.5 ml-auto flex">
          {shortlist.length > 0 && <CopyShortlist shortlist={shortlist} onDone={announce} />}
          {/* Offered while anyone is listed or kept as removed. */}
          {(shortlist.length > 0 || removedCount > 0) && <ClearShortlist listed={shortlist.length} removed={removedCount} onClear={clear} />}
        </div>
      </div>
      {/* Paper has no tabs to say whose list this is. */}
      <p className="hidden font-heading text-xl font-medium print:block">Your shortlist</p>
      {list.length > 0 && cards(list, "h2")}
      {maybes.length > 0 && <MaybeSection count={maybes.filter((entry) => listed.has(entry.card.slug)).length}>{cards(maybes, "h3")}</MaybeSection>}
      {setAside.length > 0 && (
        <SetAsideSection count={setAside.filter((entry) => listed.has(entry.card.slug)).length} open={setAsideOpen} onToggle={toggleSetAside}>
          {cards(setAside, "h3")}
        </SetAsideSection>
      )}
      <p aria-live="polite" className="sr-only">
        {announcement}
      </p>
    </div>
  );
}

type ClearProps = {
  /** How many are on the shortlist. */
  listed: number;
  /** How many removed therapists are kept, ready to be added back, whether or not the tab shows them. */
  removed: number;
  onClear: () => void;
};

/** Takes everyone off the shortlist once the visitor confirms, for a browser someone else may use next. */
function ClearShortlist({ listed, removed, onClear }: ClearProps) {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="ghost" size="sm" className="text-muted-foreground">
          Clear shortlist
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="text-lg">Clear your shortlist?</AlertDialogTitle>
          <AlertDialogDescription className="text-base">
            {listed > 0
              ? `This removes ${therapistCount(listed)} from this browser, with your notes, drafts, where you stand with them and those you said weren't for you${
                  removed > 0 ? `, and forgets the ${therapistCount(removed)} you removed` : ""
                }. It can't be undone.`
              : `This forgets the ${therapistCount(removed)} you removed, with your notes, drafts, where you stood with them and those you said weren't for you, so they can't be put back as they were.`}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={onClear}>Clear shortlist</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

type SectionProps = { count: number; open: boolean; onToggle: () => void; children: ReactNode };

/** Those set aside, under a heading that opens and closes them. */
function SetAsideSection({ count, open, onToggle, children }: SectionProps) {
  const listId = useId();
  const Icon = STATUS_ICON.setAside;
  return (
    // Closed, it stays off paper, which would have its heading over no one.
    <section className={cn("space-y-2", !open && "print:hidden")}>
      <h2 data-glide="set-aside">
        {/* Marked for the list to give it focus when a therapist is set aside while it is closed. */}
        <button
          type="button"
          data-set-aside-toggle
          aria-expanded={open}
          aria-controls={listId}
          onClick={onToggle}
          className="flex w-full items-center gap-2 rounded-md py-1 text-left text-sm font-medium outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <ChevronRight
            aria-hidden
            className={cn("size-4 shrink-0 text-muted-foreground motion-safe:transition-transform print:hidden", open && "rotate-90")}
          />
          <Icon aria-hidden className="size-4 shrink-0 text-muted-foreground" />
          {STATUS_LABEL.setAside}
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

type MaybeProps = { count: number; children: ReactNode };

/** Those the visitor is unsure of, open under a heading of their own. */
function MaybeSection({ count, children }: MaybeProps) {
  const Icon = STATUS_ICON.maybe;
  return (
    // With no one in it listed, it stays off paper, which would have its heading over no one.
    <section className={cn("space-y-2", count === 0 && "print:hidden")}>
      {/* Its icon in line with Set aside's, past the chevron there, which paper leaves out. */}
      <h2 data-glide="maybe" className="flex items-center gap-2 py-1 pl-6 text-sm font-medium print:pl-0">
        <Icon aria-hidden className="size-4 shrink-0 text-muted-foreground" />
        {STATUS_LABEL.maybe}
        <CountBadge count={count} />
      </h2>
      {children}
    </section>
  );
}

type ListProps = {
  entries: Shortlist;
  /** Everyone the tab shows, among whom a moved therapist takes their place. */
  shown: Shortlist;
  children: ReactNode;
};

/** Cards dragged by their handles among each other alone, by pointer or keyboard. */
function SortableList({ entries, shown, children }: ListProps) {
  const store = useShortlistStore();
  const announcements = useAnnouncements(entries);
  const still = useMediaQuery("(prefers-reduced-motion: reduce)");
  const sensors = useSensors(
    // A press on the handle that barely moves isn't a drag, so a stray click announces no pick-up and put-down.
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    // A card carried past the list's edge scrolls the list along, gliding unless the visitor asks for less motion.
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates, scrollBehavior: still ? "instant" : "smooth" }),
  );

  function onDragEnd({ active, over }: DragEndEvent) {
    const slugs = entries.map((entry) => entry.card.slug);
    const from = slugs.indexOf(String(active.id));
    const to = over ? slugs.indexOf(String(over.id)) : -1;
    if (to === -1 || to === from) return;
    store.move(String(active.id), between(entries, shown, from, to));
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      modifiers={[upOrDown]}
      onDragEnd={onDragEnd}
      accessibility={{ announcements, screenReaderInstructions: { draggable: INSTRUCTIONS } }}
    >
      <SortableContext items={entries.map((entry) => entry.card.slug)} strategy={verticalListSortingStrategy}>
        <ul className="space-y-4">{children}</ul>
      </SortableContext>
    </DndContext>
  );
}

/**
 * Where a therapist moved from `from` to `to` among `entries` goes: beside their new neighbour there and in the shortlist's
 * whole order alike, so they keep a place among everyone `shown` for when a status takes them to another section. A
 * therapist removed here counts as a neighbour, keeping theirs.
 */
function between(entries: Shortlist, shown: Shortlist, from: number, to: number): Between {
  const order = arrayMove([...entries], from, to);
  const others = shown.filter((entry) => entry !== entries[from]);
  const above = order[to - 1];
  const below = order[to + 1];
  return above ? { above, below: others[others.indexOf(above) + 1] } : { above: others[others.indexOf(below!) - 1], below };
}

/** Which of the tab's sections a status puts a therapist in: the visitor's list, then Maybe, then Set aside. */
function sectionOf(status: Status): "list" | "maybe" | "setAside" {
  return status === "maybe" || status === "setAside" ? status : "list";
}

type EntryProps = {
  entry: ShortlistEntry;
  heading: "h2" | "h3";
  listed: boolean;
  sought: ReadonlySet<string>;
  online: boolean;
  fee?: Fee;
  pinKey?: string;
  /** At the pin selected on the map. */
  marked: boolean;
  onHighlight?: (slug: string | undefined) => void;
  /** Moves the therapist a place up or down; missing at that end of the list. */
  onUp?: () => void;
  onDown?: () => void;
  /** After the track gives the therapist a new status. */
  onChosen: (status: Status) => void;
  /** After the track's menu takes the therapist off the shortlist. */
  onRemoved: () => void;
  /** After the track's Not for me takes the therapist off the shortlist. */
  onPassed: () => void;
};

/**
 * A card with a handle to drag it by and buttons to move it a place at a time; a therapist removed here can't be moved
 * until they are added back.
 */
function SortableEntry({ entry, heading, listed, sought, online, fee, pinKey, marked, onHighlight, onUp, onDown, onChosen,
  onRemoved, onPassed }: EntryProps) {
  const { card } = entry;
  const status = statusOf(entry);
  // The cards a drag passes glide aside, and the one let go glides into place, unless the visitor asks for less motion.
  const still = useMediaQuery("(prefers-reduced-motion: reduce)");
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({
    id: card.slug,
    disabled: { draggable: !listed },
    transition: still ? null : undefined,
  });
  // The callback holding this card's highlight, while it does: an unmounted card gets no blur or pointer-leave to give it up.
  const highlighting = useRef<EntryProps["onHighlight"]>(undefined);
  // A layout effect, so the highlight is given up before the list gives focus to the card's new place.
  useLayoutEffect(() => () => highlighting.current?.(undefined), []);
  return (
    // Marked by pin, so the page can bring a selected pin's therapists into view, and by slug, for it to glide to a new place.
    // Positioned, for a z-index to raise a card as it glides.
    <li
      ref={setNodeRef}
      data-pin={pinKey}
      data-glide={card.slug}
      aria-current={marked || undefined}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={cn(
        "relative flex items-center gap-1",
        // Off the shortlist, so off paper too.
        !listed && "print:hidden",
        // Carried over its neighbours, lifted off the list; framed in dashes under forced colours, which drop the shadow, clear
        // of the outline a marked card has there.
        isDragging && "z-10 [&_[data-slot=card]]:shadow-lg forced-colors:outline-2 forced-colors:outline-offset-4 forced-colors:outline-dashed",
      )}
    >
      {/* Move up and Move down are marked by slug, for the list to give one of them focus once the card has moved. On a touch
          screen the three stand far enough apart, and from the card, that no one's target takes another's taps. */}
      <div className="flex flex-col pointer-coarse:mr-1 pointer-coarse:gap-4">
        <IconButton
          label={`Move ${card.name} up`}
          side="right"
          variant="ghost"
          size="icon-sm"
          className="text-muted-foreground"
          disabled={!listed || !onUp}
          data-move-up={card.slug}
          onClick={onUp}
        >
          <ChevronUp aria-hidden />
        </IconButton>
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
        <IconButton
          label={`Move ${card.name} down`}
          side="right"
          variant="ghost"
          size="icon-sm"
          className="text-muted-foreground"
          disabled={!listed || !onDown}
          data-move-down={card.slug}
          onClick={onDown}
        >
          <ChevronDown aria-hidden />
        </IconButton>
      </div>
      <div className={cn("min-w-0 flex-1 rounded-xl", marked && "ring-2 ring-highlight forced-marked")}>
        <TherapistCard
          therapist={card}
          sought={sought}
          online={online}
          heading={heading}
          fee={fee}
          faded={!listed}
          brief
          action={<ShortlistButton therapist={card} />}
          track={<StatusTrack therapist={card} status={status} listed={listed} onChosen={onChosen} onRemoved={onRemoved} onPassed={onPassed} />}
          note={entry.note}
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
  "To move a therapist, press space or enter to pick them up, the up and down arrows to move them, and space or enter again to put them down. Escape puts them back.";

/** What a screen reader hears as a therapist is moved, by name and by number among those beside them, where dnd-kit's own would read out the slug. */
function useAnnouncements(entries: Shortlist): Announcements {
  // A pick-up is at once over the therapist's own place, which the pick-up has announced already.
  const pickedUp = useRef(false);
  const find = (id: UniqueIdentifier) => {
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

/**
 * Everyone shortlisted while the tab is open, so a therapist removed here stays in place, ready to be added back, until
 * the list is cleared.
 */
function useShown(shortlist: Shortlist): Shortlist {
  const clears = useShortlistClears();
  const [shown, setShown] = useState(shortlist);
  const [seen, setSeen] = useState({ shortlist, clears });
  if (seen.shortlist !== shortlist || seen.clears !== clears) {
    setSeen({ shortlist, clears });
    const current = new Set(shortlist.map((entry) => entry.card.slug));
    const removed = seen.clears === clears ? shown.filter((entry) => !current.has(entry.card.slug)) : [];
    setShown([...shortlist, ...removed].sort(byRank));
  }
  return shown;
}

/**
 * Marks where each card, and each section's heading, stands in the tab, for the next draw to glide each from there to where
 * it puts them, as a status moves a card from one section to another. The card whose status it was is raised over those it
 * passes, which a card brought back from below would otherwise glide beneath, and stays raised if another change restarts its
 * glide. Under reduced motion they move at once.
 */
function useGlide(root: RefObject<HTMLElement | null>): (raised: string) => void {
  const stood = useRef<{ tops: Map<string, number>; raised: string } | undefined>(undefined);
  const [glides] = useState(() => new WeakMap<Element, { animation: Animation; raised: boolean }>());
  useLayoutEffect(() => {
    const before = stood.current;
    stood.current = undefined;
    if (!before) return;
    const elements = gliders(root.current);
    // Every glide still running is let go before anything is measured, to read where each card lands in one pass over the layout;
    // the mark was where it showed, so the new one goes on from there.
    const carried = new Set<Element>();
    for (const element of elements) {
      const running = glides.get(element);
      if (running?.raised && running.animation.playState === "running") carried.add(element);
      running?.animation.cancel();
    }
    const tops = topsIn(root.current, elements);
    elements.forEach((element, i) => {
      const slug = element.dataset.glide!;
      const from = before.tops.get(slug);
      const by = from === undefined ? 0 : from - tops[i]!;
      if (!by) return;
      const raised = slug === before.raised || carried.has(element);
      const animation = element.animate({ translate: [`0 ${by}px`, "0 0"], ...(raised && { zIndex: [1, 1] }) }, GLIDE);
      glides.set(element, { animation, raised });
    });
  });
  return (raised) => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const elements = gliders(root.current);
    const tops = topsIn(root.current, elements);
    stood.current = { tops: new Map(elements.map((element, i) => [element.dataset.glide!, tops[i]!])), raised };
  };
}

/** What glides in the tab: each card, by slug, and each section's heading. */
function gliders(root: HTMLElement | null): HTMLElement[] {
  return [...(root?.querySelectorAll<HTMLElement>("[data-glide]") ?? [])];
}

/** How far down the tab each element stands, so a scroll, such as a focus can cause, moves nothing. */
function topsIn(root: HTMLElement | null, elements: HTMLElement[]): number[] {
  const top = root?.getBoundingClientRect().top ?? 0;
  return elements.map((element) => element.getBoundingClientRect().top - top);
}
