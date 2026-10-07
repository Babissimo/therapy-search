import type { ComponentProps } from "react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

type Props = ComponentProps<typeof Button> & {
  label: string;
  side?: ComponentProps<typeof TooltipContent>["side"];
  /**
   * Shows the label after the icon on a touch screen, which has no tooltip to name it by, for those who say what they tap,
   * and wherever the button is laid out as there (`stacked`); or, given words, only those, which must start the label, so
   * what is said still names the button.
   */
  touchLabel?: boolean | string;
};

/**
 * A button showing only its icon, named by `label` in a tooltip and to screen readers. The label comes first in its
 * name, so visually hidden text among the children, such as a count, follows it.
 */
export function IconButton({ label, side = "bottom", size = "icon", touchLabel = false, className, children, ...props }: Props) {
  const shown = touchLabel === true ? label : touchLabel || undefined;
  const rest = shown === undefined ? "" : label.slice(shown.length).trimStart();
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          size={size}
          className={cn(shown && "stacked:w-auto stacked:gap-1.5 stacked:px-2.5", className)}
          {...props}
        >
          {/* First in the name and last on screen, after the icon. */}
          {shown ? (
            <>
              <span className="sr-only stacked:not-sr-only stacked:order-last stacked:whitespace-nowrap">{shown}</span>
              {/* Parted from them by a space of the button's own, as each part of a name is read trimmed; a flex box draws it as
                  nothing. */}
              {rest && (
                <>
                  {" "}
                  <span className="sr-only">{rest}</span>
                </>
              )}
            </>
          ) : (
            <span className="sr-only">{label}</span>
          )}
          {children}
        </Button>
      </TooltipTrigger>
      {/* Drawn outside any card or header, so only the pointer can hide it; with a mouse it stays, naming the button in full. */}
      <TooltipContent side={side} className={cn(shown && "pointer-coarse:hidden")}>
        {label}
      </TooltipContent>
    </Tooltip>
  );
}
