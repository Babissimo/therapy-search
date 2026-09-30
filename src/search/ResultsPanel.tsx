import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { useId, type ReactNode, type Ref } from "react";
import { IconButton } from "@/components/IconButton";

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

/** The results and shortlist beside the map on wide screens: a plain region rather than a dialog, so the map stays usable. */
export function ResultsPanel({ open, onOpenChange, tabs, masthead, scrollRef, onScroll, footer, children }: Props) {
  const id = useId();
  return (
    <>
      <div id={id} hidden={!open} className="flex w-96 shrink-0 flex-col border-r bg-background">
        {masthead}
        {/* The panel and its list are positioned so that visually hidden text is placed inside them rather than stretching the page. */}
        <section aria-label="Results and shortlist" className="relative flex min-h-0 flex-1 flex-col">
          <div className="flex items-center justify-between gap-2 border-b px-4 py-2">
            {tabs}
            <IconButton label="Hide list" side="right" variant="ghost" size="icon-sm" aria-expanded aria-controls={id} onClick={() => onOpenChange(false)}>
              <PanelLeftClose aria-hidden />
            </IconButton>
          </div>
          <div ref={scrollRef} onScroll={(e) => onScroll?.(e.currentTarget.scrollTop)} className="relative min-h-0 flex-1 overflow-y-auto p-4">
            {children}
          </div>
          {footer}
        </section>
      </div>
      {!open && (
        <div className="shrink-0 border-r p-2">
          <IconButton
            label="Show list"
            side="right"
            variant="outline"
            size="icon-sm"
            aria-expanded={false}
            aria-controls={id}
            onClick={() => onOpenChange(true)}
          >
            <PanelLeftOpen aria-hidden />
          </IconButton>
        </div>
      )}
    </>
  );
}
