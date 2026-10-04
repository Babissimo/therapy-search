import { CircleAlert } from "lucide-react";
import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

type Props = ComponentProps<"p"> & {
  /** Silent, for a caller that says the error from a live region there before it. */
  quiet?: boolean;
};

/** A short error on a line of its own, marked by the alerts' icon as well as its colour, and announced as it appears. */
export function ErrorLine({ className, children, quiet = false, ...props }: Props) {
  return (
    <p role={quiet ? undefined : "alert"} className={cn("flex gap-1.5 text-sm text-destructive", className)} {...props}>
      <CircleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
      <span>{children}</span>
    </p>
  );
}
