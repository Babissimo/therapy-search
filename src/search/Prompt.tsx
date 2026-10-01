import type { ReactNode, Ref } from "react";
import { HelpNow } from "@/layout/HelpNow";
import { cn } from "@/lib/utils";

type Props = {
  ask: ReactNode;
  children: ReactNode;
  /** Makes the ask and its line one focusable block apart from the help, for a view to send the keyboard to. */
  askRef?: Ref<HTMLDivElement>;
  className?: string;
};

/**
 * What a view asks for before it has anything to search, in large type in place of its results, with a line on how and,
 * smaller, where to turn for help today.
 */
export function Prompt({ ask, children, askRef, className }: Props) {
  return (
    <div className={cn("space-y-4 text-center text-balance sm:space-y-6", className)}>
      <div ref={askRef} tabIndex={askRef ? -1 : undefined} className="space-y-4 outline-none sm:space-y-6">
        <p className="font-heading text-3xl font-medium sm:text-4xl">{ask}</p>
        <p className="text-lg text-muted-foreground sm:text-xl">{children}</p>
      </div>
      <HelpNow className="pt-4 text-muted-foreground sm:pt-6" />
    </div>
  );
}
