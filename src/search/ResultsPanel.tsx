import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { useId, type ReactNode, type Ref } from "react";
import { IconButton } from "@/components/IconButton";
import { Morph } from "@/components/Morph";
import { cn } from "@/lib/utils";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  toggleRef?: Ref<HTMLButtonElement>;
  /** The tabs between the results and the shortlist, heading the panel. */
  tabs: ReactNode;
  /** Above the tabs, and hidden with them. */
  masthead: ReactNode;
  scrollRef?: Ref<HTMLDivElement>;
  onScroll?: (scrollTop: number) => void;
  /**
   * Beneath the list rather than at its end, so it stays in view however far the list scrolls. Unlike the rest, it is
   * not made inert as the panel hides, so it can keep a control in view, placed against the panel's outer box.
   */
  footer?: ReactNode;
  children: ReactNode;
};

/**
 * The results and shortlist beside the map on wide screens: a plain region rather than a dialog, so the map stays usable.
 * Its toggle stays put whether it is open or not, so a second click finds it where the first left it; hidden, the panel
 * slides away to leave only the toggle, floating over the top left of the map beside it, and what its footer keeps.
 */
export function ResultsPanel({ open, onOpenChange, toggleRef, tabs, masthead, scrollRef, onScroll, footer, children }: Props) {
  const id = useId();
  return (
    <div className="relative flex shrink-0 print:block">
      <IconButton
        ref={toggleRef}
        label={open ? "Hide list" : "Show list"}
        // Named whole over the map, but beside the masthead by its first word alone, which leaves the site's name two lines.
        touchLabel={open ? "Hide" : true}
        variant={open ? "ghost" : "outline"}
        aria-expanded={open}
        aria-controls={id}
        onClick={() => onOpenChange(!open)}
        // Under IconButton's own variant, so cn swaps its padding for this one rather than keeping both.
        className={cn("absolute top-3 left-4 z-10 stacked:px-2", !open && "shadow-md dark:bg-background dark:hover:bg-muted")}
      >
        {open ? <PanelLeftClose aria-hidden /> : <PanelLeftOpen aria-hidden />}
      </IconButton>
      {/* Hidden, it narrows to nothing, clipping its content from the left, and its parts are inert rather than gone, so it
          can slide. Invisible once it has, so find in page passes over it in browsers that search inert text. Neither it
          nor anything holding the footer is positioned, so the footer can place a control against the outer box, beyond
          the clip. Printed, it takes the page's width, open or not, its list running on unclipped. */}
      <div
        id={id}
        className={cn(
          "flex justify-end overflow-hidden motion-safe:transition-[width,visibility] motion-safe:duration-200 print:visible print:block print:w-full print:overflow-visible",
          open ? "w-96" : "invisible w-0",
        )}
      >
        {/* Rows are divided by the top border of the one beneath, so the top row's height is all its own. */}
        <div className="flex w-96 shrink-0 flex-col border-r bg-background print:block print:w-full print:border-r-0">
          {/* Centred on the toggle, leaving room for it on the left, wider on a touch screen, where it is named on screen. */}
          <div inert={!open} className="grid min-h-14 items-center pr-4 pl-14 pointer-coarse:pl-24 print:pl-4">
            {masthead}
          </div>
          <section aria-label="Results and shortlist" className="flex min-h-0 flex-1 flex-col border-t print:block">
            <div inert={!open} className="flex items-center px-4 py-2 print:hidden">
              {tabs}
            </div>
            <Morph name="list">
              {/* Positioned so that visually hidden text in the list is placed inside it rather than stretching the page. */}
              <div
                ref={scrollRef}
                inert={!open}
                onScroll={(e) => onScroll?.(e.currentTarget.scrollTop)}
                className="relative min-h-0 flex-1 overflow-y-auto border-t p-4 print:overflow-visible print:border-t-0 print:pb-0"
              >
                {children}
              </div>
            </Morph>
            {footer}
          </section>
        </div>
      </div>
    </div>
  );
}
