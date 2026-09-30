import { useRef, useState, type MouseEvent, type PointerEvent, type ReactNode, type Ref } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type SheetPosition = "peek" | "half" | "full";

// In rem: peek shows the header alone; full leaves the search box and a strip of map above the sheet.
const PEEK_REM = 3.5;
const FULL_GAP_REM = 8;
const HEIGHT: Record<SheetPosition, string> = { peek: `${PEEK_REM}rem`, half: "50%", full: `calc(100% - ${FULL_GAP_REM}rem)` };

type Props = {
  position: SheetPosition;
  onPositionChange: (position: SheetPosition) => void;
  /** The tabs between the results and the shortlist, in the header, so they show however low the sheet is. */
  tabs: ReactNode;
  /** What the button that lowers the sheet says, naming what lowering it shows. */
  lowerLabel?: string;
  scrollRef?: Ref<HTMLDivElement>;
  onScroll?: (scrollTop: number) => void;
  /** Beneath the list rather than at its end, so it stays in view however far the list scrolls. */
  footer?: ReactNode;
  children: ReactNode;
};

/**
 * The results and shortlist over the bottom of the map on narrow screens: a plain region rather than a dialog, so the
 * map above stays usable. Only the header drags; the list inside scrolls as normal, so the two gestures never compete.
 */
export function ResultsSheet({ position, onPositionChange, tabs, lowerLabel = "Show map", scrollRef, onScroll, footer, children }: Props) {
  const sheet = useRef<HTMLElement>(null);
  const drag = useRef<{ startY: number; startHeight: number } | null>(null);
  // The state draws the sheet; the ref is what a pointerup reads, as the last move may not have rendered yet.
  const [dragHeight, setDragHeight] = useState<number | null>(null);
  const liveHeight = useRef<number | null>(null);

  function start(event: PointerEvent<HTMLDivElement>) {
    // The header's buttons, tabs among them, keep their clicks.
    if (!sheet.current || (event.target as Element).closest("button")) return;
    event.currentTarget.setPointerCapture?.(event.pointerId);
    drag.current = { startY: event.clientY, startHeight: sheet.current.getBoundingClientRect().height };
  }

  function move(event: PointerEvent<HTMLDivElement>) {
    const container = sheet.current?.parentElement;
    if (!drag.current || !container) return;
    const { peek, full } = heights(container);
    liveHeight.current = Math.min(full, Math.max(peek, drag.current.startHeight - (event.clientY - drag.current.startY)));
    setDragHeight(liveHeight.current);
  }

  // A tab pressed on a lowered sheet, whether or not it is the one open, is a list the visitor wants to see.
  function raiseForTab(event: MouseEvent<HTMLDivElement>) {
    if (position === "peek" && (event.target as Element).closest('[role="tab"]')) onPositionChange("full");
  }

  function end() {
    const container = sheet.current?.parentElement;
    const height = liveHeight.current;
    if (drag.current && height !== null && container) onPositionChange(nearest(height, heights(container)));
    drag.current = null;
    liveHeight.current = null;
    setDragHeight(null);
  }

  return (
    <section
      ref={sheet}
      aria-label="Results and shortlist"
      data-position={position}
      style={{ height: dragHeight === null ? HEIGHT[position] : `${dragHeight}px` }}
      className={cn(
        // Clipped, so the footer never shows below a sheet lowered to its header.
        "absolute inset-x-0 bottom-0 z-20 flex flex-col overflow-hidden rounded-t-2xl border-t bg-background shadow-lg",
        dragHeight === null && "transition-[height] duration-200",
      )}
    >
      <div
        onPointerDown={start}
        onPointerMove={move}
        onPointerUp={end}
        onPointerCancel={end}
        onClick={raiseForTab}
        className="relative flex h-14 shrink-0 cursor-grab touch-none items-center justify-between gap-2 px-4"
      >
        <span aria-hidden className="absolute top-1.5 left-1/2 h-1 w-10 -translate-x-1/2 rounded-full bg-muted-foreground/40" />
        {tabs}
        <Button type="button" variant="outline" size="sm" onClick={() => onPositionChange(position === "full" ? "peek" : "full")}>
          {position === "full" ? lowerLabel : "Show list"}
        </Button>
      </div>
      {/* Positioned so that visually hidden text is placed inside the list rather than stretching the page. */}
      <div
        ref={scrollRef}
        inert={position === "peek"}
        onScroll={(e) => onScroll?.(e.currentTarget.scrollTop)}
        className="relative min-h-0 flex-1 overflow-y-auto px-4 pb-4"
      >
        {children}
      </div>
      <div inert={position === "peek"} className="shrink-0">
        {footer}
      </div>
    </section>
  );
}

type Heights = Record<SheetPosition, number>;

/** Each position's height in pixels, within the map area the sheet sits in. */
function heights(container: HTMLElement): Heights {
  const rem = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
  const total = container.clientHeight;
  return { peek: PEEK_REM * rem, half: total / 2, full: total - FULL_GAP_REM * rem };
}

function nearest(height: number, positions: Heights): SheetPosition {
  const order: SheetPosition[] = ["peek", "half", "full"];
  return order.reduce((best, p) => (Math.abs(positions[p] - height) < Math.abs(positions[best] - height) ? p : best));
}
