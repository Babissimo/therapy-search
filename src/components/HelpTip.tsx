import { useState, type ReactNode } from "react";
import { CircleHelp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

type Props = { label: string; children: ReactNode };

/** A question mark that explains the heading beside it in a tooltip, on hover, focus or tap. */
export function HelpTip({ label, children }: Props) {
  const [open, setOpen] = useState(false);
  return (
    <Tooltip open={open} onOpenChange={setOpen}>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label={label}
          // Radix closes a tooltip on click, so a tap would never show one.
          onClick={(e) => {
            e.preventDefault();
            setOpen(true);
          }}
        >
          <CircleHelp aria-hidden />
        </Button>
      </TooltipTrigger>
      <TooltipContent>{children}</TooltipContent>
    </Tooltip>
  );
}
