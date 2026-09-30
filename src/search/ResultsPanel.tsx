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
  masthead?: ReactNode;
  scrollRef?: Ref<HTMLDivElement>;
  onScroll?: (scrollTop: number) => void;
  /** Beneath the list rather than at its end, so it stays in view however far the list scrolls. */
  footer?: ReactNode;
  children: ReactNode;
};

// The panel's top row, whichever it is, is centred on the toggle and leaves room for it on its left.
const TOP_ROW = "min-h-14 pr-4 pl-14";

/**
 * The results and shortlist beside the map on wide screens: a plain region rather than a dialog, so the map stays usable.
 * Its toggle stays put whether it is open or not, so a second click finds it where the first left it; hidden, the panel
 * leaves only the toggle, floating over the top left of the map or prompt beside it.
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
      {/* Rows are divided by the top border of the one beneath, so the top row's height is all its own. */}
      <div id={id} hidden={!open} className="flex w-96 flex-col border-r bg-background">
        {masthead && <div className={cn("grid items-center", TOP_ROW)}>{masthead}</div>}
        {/* The panel and its list are positioned so that visually hidden text is placed inside them rather than stretching the page. */}
        <section aria-label="Results and shortlist" className={cn("relative flex min-h-0 flex-1 flex-col", masthead && "border-t")}>
          <div className={cn("flex items-center", masthead ? "px-4 py-2" : TOP_ROW)}>{tabs}</div>
          <div ref={scrollRef} onScroll={(e) => onScroll?.(e.currentTarget.scrollTop)} className="relative min-h-0 flex-1 overflow-y-auto border-t p-4">
            {children}
          </div>
          {footer}
        </section>
      </div>
    </div>
  );
}
