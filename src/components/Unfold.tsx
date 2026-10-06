import { useLayoutEffect, useRef, useState, type ReactNode, type TransitionEvent } from "react";
import { cn } from "@/lib/utils";

type Props = {
  open: boolean;
  /** Unfolds sideways, to its width within a line of text; otherwise downwards, to its height. */
  across?: boolean;
  className?: string;
  children: ReactNode;
};

/**
 * Unfolds what it holds as `open` turns true, and folds it away as `open` turns false, holding it until folded and then
 * nothing. The box is drawn throughout, for the fold to start from its size, by a grid whose one track goes between 0fr and
 * 1fr; what it holds is clipped to it, out of reach as it folds and out of sight once folded.
 */
export function Unfold({ open, across = false, className, children }: Props) {
  const box = useRef<HTMLElement | null>(null);
  const [folding, setFolding] = useState(false);
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    setFolding(!open);
  }
  // Where nothing times the fold, as under reduced motion, no transition will end it.
  useLayoutEffect(() => {
    if (folding && box.current && !timed(box.current)) setFolding(false);
  }, [folding]);
  const ended = (event: TransitionEvent<HTMLElement>) => {
    if (event.target === event.currentTarget && !open) setFolding(false);
  };
  // A transition cut short by another, as a fold reversed, still folds; one cut short by nothing, as when the fold stops
  // being timed part way, never ends.
  const cancelled = (event: TransitionEvent<HTMLElement>) => {
    if (event.target === event.currentTarget && !open && !timed(event.currentTarget)) setFolding(false);
  };
  const Box = across ? "span" : "div";
  return (
    <Box
      ref={(element: HTMLElement | null) => {
        box.current = element;
      }}
      inert={!open}
      onTransitionEnd={ended}
      onTransitionCancel={cancelled}
      className={cn(
        "grid motion-safe:transition-[grid-template-rows,grid-template-columns,opacity,visibility] motion-safe:duration-200",
        across ? (open ? "grid-cols-[1fr]" : "grid-cols-[0fr]") : open ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
        // What it holds adds nothing to a line's min-content, so a crowded line would squeeze it out of sight; the track's
        // width, which follows the fold, is the floor.
        across && "min-w-max",
        // Visibility holds until the fold ends, then takes what it held out of sight and out of a screen reader's hearing.
        !open && "invisible opacity-0",
        className,
      )}
    >
      {/* No smaller than nothing, so the track can close to 0; across, a flex item rather than text on a baseline. */}
      <Box className={cn("overflow-hidden", across ? "flex min-w-0" : "min-h-0")}>{(open || folding) && children}</Box>
    </Box>
  );
}

/** Whether any transition on `element` takes time. */
function timed(element: Element): boolean {
  return getComputedStyle(element)
    .transitionDuration.split(",")
    .some((duration) => parseFloat(duration) > 0);
}
