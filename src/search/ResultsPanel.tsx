import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { useId, type ReactNode, type Ref } from "react";
import { Button } from "@/components/ui/button";
import { resultCount } from "./reach";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  count?: number;
  scrollRef?: Ref<HTMLDivElement>;
  onScroll?: (scrollTop: number) => void;
  children: ReactNode;
};

/** The results beside the map on wide screens: a plain region rather than a dialog, so the map stays usable. */
export function ResultsPanel({ open, onOpenChange, count, scrollRef, onScroll, children }: Props) {
  const id = useId();
  return (
    <>
      <section id={id} aria-label="Results" hidden={!open} className="flex w-96 shrink-0 flex-col border-r bg-background">
        <div className="flex items-center justify-between gap-2 border-b px-4 py-2">
          <h2 className="text-sm font-semibold">{resultCount(count)}</h2>
          <Button type="button" variant="ghost" size="sm" aria-expanded aria-controls={id} onClick={() => onOpenChange(false)}>
            <PanelLeftClose aria-hidden />
            Hide results
          </Button>
        </div>
        <div ref={scrollRef} onScroll={(e) => onScroll?.(e.currentTarget.scrollTop)} className="min-h-0 flex-1 overflow-y-auto p-4">
          {children}
        </div>
      </section>
      {!open && (
        <div className="shrink-0 border-r p-2">
          <Button type="button" variant="outline" size="sm" aria-expanded={false} aria-controls={id} onClick={() => onOpenChange(true)}>
            <PanelLeftOpen aria-hidden />
            {count === undefined ? "Show results" : `Show results (${count})`}
          </Button>
        </div>
      )}
    </>
  );
}
