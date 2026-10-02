import { Info } from "lucide-react";
import { useEffect, useId, useRef, useState, type PointerEvent } from "react";
import { useLocation } from "react-router";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { AboutText } from "./AboutText";

// Long enough that a pointer passing over the title opens nothing, and that it can cross the gap to the card.
const OPEN_DELAY_MS = 300;
const CLOSE_DELAY_MS = 200;

/** Hovered cards follow the pointer; a pinned one stays until dismissed. */
type Shown = "hover" | "pinned" | null;

/**
 * The site's name, which shows what the site is while the pointer is over it. A click, tap or Enter pins the card
 * open and moves focus into it, so touch and the keyboard reach its links too.
 */
export function SiteTitle({ as: Title = "h1" }: { as?: "h1" | "p" }) {
  const [shown, setShown] = useState<Shown>(null);
  const timer = useRef<number>(undefined);
  const content = useRef<HTMLDivElement>(null);
  // Whether the card held focus, which then goes back to the title as it closes, unless something outside has taken it
  // since; otherwise focus stays where it is.
  const focusInside = useRef(false);
  const headingId = useId();
  useEffect(() => () => window.clearTimeout(timer.current), []);
  const close = () => {
    window.clearTimeout(timer.current);
    setShown(null);
  };
  // The card belongs to the page it opened over, so going to another, by its statement link or by Back, puts it away. A
  // search's place or filters changing leaves it be.
  const { pathname } = useLocation();
  const page = useRef(pathname);
  useEffect(() => {
    if (page.current === pathname) return;
    page.current = pathname;
    close();
  }, [pathname]);

  function hover(next: "hover" | null, delay: number) {
    window.clearTimeout(timer.current);
    const apply = () => setShown((now) => (now === "pinned" ? now : next));
    if (delay === 0) apply();
    else timer.current = window.setTimeout(apply, delay);
  }
  // Only a mouse hovers: a touch's pointer events come with its tap, which pins the card instead.
  const hoverProps = {
    onPointerEnter: (e: PointerEvent) => {
      if (e.pointerType === "mouse") hover("hover", shown ? 0 : OPEN_DELAY_MS);
    },
    onPointerLeave: (e: PointerEvent) => {
      if (e.pointerType === "mouse") hover(null, CLOSE_DELAY_MS);
    },
  };

  return (
    <Popover
      open={shown !== null}
      onOpenChange={(open) => {
        if (!open) close();
      }}
    >
      <Title className="min-w-0 font-heading text-lg font-medium">
        <PopoverTrigger
          {...hoverProps}
          onClick={(e) => {
            // In place of the trigger's own toggle, so a click on a hovered card pins it rather than closing it.
            e.preventDefault();
            window.clearTimeout(timer.current);
            setShown((now) => (now === "pinned" ? null : "pinned"));
          }}
          className="relative flex cursor-help items-center gap-1.5 rounded-md text-left touch-target outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          Find a UKCP therapist
          <Info aria-hidden className="size-4 shrink-0 text-muted-foreground print:hidden" />
        </PopoverTrigger>
      </Title>
      <PopoverContent
        ref={content}
        {...hoverProps}
        // Beside the title rather than at the end of the page, so Tab leaves the card for whatever follows the title.
        portal={false}
        align="start"
        aria-labelledby={headingId}
        onFocus={() => (focusInside.current = true)}
        onOpenAutoFocus={(e) => {
          e.preventDefault();
          if (shown === "pinned") content.current?.focus();
        }}
        onCloseAutoFocus={(e) => {
          const now = document.activeElement;
          const taken = now !== null && now !== document.body && !content.current?.contains(now);
          if (!focusInside.current || taken) e.preventDefault();
          focusInside.current = false;
        }}
        className="max-h-(--radix-popover-content-available-height) w-96 max-w-[calc(100vw-2rem)] gap-3 overflow-y-auto p-4 leading-relaxed"
      >
        <h2 id={headingId} className="font-semibold">
          About this site
        </h2>
        <AboutText />
      </PopoverContent>
    </Popover>
  );
}
