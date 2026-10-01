import type { ComponentProps } from "react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

type Props = ComponentProps<typeof Button> & {
  label: string;
  side?: ComponentProps<typeof TooltipContent>["side"];
  /** Shows the label after the icon on touch screens, which have no tooltip to name it by, for those who say what they tap. */
  touchLabel?: boolean;
};

/**
 * A button showing only its icon, named by `label` in a tooltip and to screen readers. The label comes first in its
 * name, so visually hidden text among the children, such as a count, follows it.
 */
export function IconButton({ label, side = "bottom", size = "icon", touchLabel = false, className, children, ...props }: Props) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          size={size}
          className={cn(touchLabel && "pointer-coarse:w-auto pointer-coarse:gap-1.5 pointer-coarse:px-2.5", className)}
          {...props}
        >
          {/* First in the name and last on screen, after the icon. */}
          <span className={cn("sr-only", touchLabel && "pointer-coarse:not-sr-only pointer-coarse:order-last pointer-coarse:whitespace-nowrap")}>
            {label}
          </span>
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent side={side} className={cn(touchLabel && "pointer-coarse:hidden")}>
        {label}
      </TooltipContent>
    </Tooltip>
  );
}
