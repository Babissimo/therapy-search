import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { useId, type ReactNode, type Ref } from "react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  scrollRef?: Ref<HTMLDivElement>;
  onScroll?: (scrollTop: number) => void;
  /** Beneath the list rather than at its end, so it stays in view however far the list scrolls. */
  footer?: ReactNode;
  children: ReactNode;
};

/** The results beside the map on wide screens: a plain region rather than a dialog, so the map stays usable. */
export function ResultsPanel({ open, onOpenChange, title, scrollRef, onScroll, footer, children }: Props) {
  const id = useId();
  return (
    <>
      {/* The panel and its list are positioned so that visually hidden text is placed inside them rather than stretching the page. */}
      <section id={id} aria-label="Results" hidden={!open} className="relative flex w-96 shrink-0 flex-col border-r bg-background">
        <div className="flex items-center justify-between gap-2 border-b px-4 py-2">
          <h2 className="text-sm font-semibold">{title}</h2>
          <Toggle label="Hide results" expanded controls={id} onClick={() => onOpenChange(false)}>
            <PanelLeftClose aria-hidden />
          </Toggle>
        </div>
        <div ref={scrollRef} onScroll={(e) => onScroll?.(e.currentTarget.scrollTop)} className="relative min-h-0 flex-1 overflow-y-auto p-4">
          {children}
        </div>
        {footer}
      </section>
      {!open && (
        <div className="shrink-0 border-r p-2">
          <Toggle label="Show results" expanded={false} controls={id} variant="outline" onClick={() => onOpenChange(true)}>
            <PanelLeftOpen aria-hidden />
          </Toggle>
        </div>
      )}
    </>
  );
}

type ToggleProps = { label: string; expanded: boolean; controls: string; variant?: "ghost" | "outline"; onClick: () => void; children: ReactNode };

function Toggle({ label, expanded, controls, variant = "ghost", onClick, children }: ToggleProps) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button type="button" variant={variant} size="icon-sm" aria-label={label} aria-expanded={expanded} aria-controls={controls} onClick={onClick}>
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent side="right">{label}</TooltipContent>
    </Tooltip>
  );
}
