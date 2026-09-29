import type { ComponentProps } from "react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

type Props = ComponentProps<typeof Button> & { label: string; side?: ComponentProps<typeof TooltipContent>["side"] };

/**
 * A button showing only its icon, named by `label` in a tooltip and to screen readers. The label comes first in its
 * name, so visually hidden text among the children, such as a count, follows it.
 */
export function IconButton({ label, side = "bottom", size = "icon", children, ...props }: Props) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button type="button" size={size} {...props}>
          <span className="sr-only">{label}</span>
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent side={side}>{label}</TooltipContent>
    </Tooltip>
  );
}
