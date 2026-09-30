import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { useId, type ReactNode, type Ref } from "react";
import { IconButton } from "@/components/IconButton";
import { cn } from "@/lib/utils";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The tabs between the results and the shortlist, heading the panel. */
  tabs: ReactNode;
  /** Above the tabs, and hidden with them. */
  masthead: ReactNode;
  scrollRef?: Ref<HTMLDivElement>;
  onScroll?: (scrollTop: number) => void;
  /** Beneath the list rather than at its end, so it stays in view however far the list scrolls. */
  footer?: ReactNode;
  children: ReactNode;
};

/**
 * The results and shortlist beside the map on wide screens: a plain region rather than a dialog, so the map stays usable.
 * Its toggle stays put whether it is open or not, so a second click finds it where the first left it; hidden, the panel
 * slides away to leave only the toggle, floating over the top left of the map beside it.
 */
export function ResultsPanel({ open, onOpenChange, tabs, masthead, scrollRef, onScroll, footer, children }: Props) {
  const id = useId();
  return (
    <div className="relative flex shrink-0">
      <IconButton
        label={open ? "Hide list" : "Show list"}
        variant={open ? "ghost" : "outline"}
        aria-expanded={open}
        aria-controls={id}
        onClick={() => onOpenChange(!open)}
        className={cn("absolute top-3 left-4 z-10", !open && "shadow-md dark:bg-background dark:hover:bg-muted")}
      >
        {open ? <PanelLeftClose aria-hidden /> : <PanelLeftOpen aria-hidden />}
      </IconButton>
      {/* Hidden, it narrows to nothing, clipping its content from the left, and is inert rather than gone, so it can slide.
          Invisible once it has, so find in page passes over it in browsers that search inert text. */}
      <div
        id={id}
        inert={!open}
        className={cn(
          "flex justify-end overflow-hidden motion-safe:transition-[width,visibility] motion-safe:duration-200",
          open ? "w-96" : "invisible w-0",
        )}
      >
        {/* Rows are divided by the top border of the one beneath, so the top row's height is all its own. */}
        <div className="flex w-96 shrink-0 flex-col border-r bg-background">
          {/* Centred on the toggle, leaving room for it on the left. */}
          <div className="grid min-h-14 items-center pr-4 pl-14">{masthead}</div>
          {/* The panel and its list are positioned so that visually hidden text is placed inside them rather than stretching the page. */}
          <section aria-label="Results and shortlist" className="relative flex min-h-0 flex-1 flex-col border-t">
            <div className="flex items-center px-4 py-2">{tabs}</div>
            <div ref={scrollRef} onScroll={(e) => onScroll?.(e.currentTarget.scrollTop)} className="relative min-h-0 flex-1 overflow-y-auto border-t p-4">
              {children}
            </div>
            {footer}
          </section>
        </div>
      </div>
    </div>
  );
}
