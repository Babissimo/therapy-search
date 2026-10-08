import * as React from "react"
import { cn } from "cn"
import { Dialog as DialogPrimitive } from "radix-ui"
import { XIcon } from "lucide-react"

import { Button } from "@/components/ui/button"

function Dialog({ ...props }: React.ComponentProps<typeof DialogPrimitive.Root>) {
  return <DialogPrimitive.Root data-slot="dialog" {...props} />
}

function DialogPortal({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Portal>) {
  return <DialogPrimitive.Portal data-slot="dialog-portal" {...props} />
}

function DialogOverlay({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Overlay>) {
  return (
    <DialogPrimitive.Overlay
      data-slot="dialog-overlay"
      className={cn(
        "fixed inset-0 z-50 bg-black/10 duration-100 supports-backdrop-filter:backdrop-blur-xs motion-safe:data-open:animate-in data-open:fade-in-0 motion-safe:data-closed:animate-out data-closed:fade-out-0",
        className
      )}
      {...props}
    />
  )
}

/** Fills a phone's screen, and from `sm` up stands in the middle of it. Its close button comes with `DialogHeader`. */
function DialogContent({
  className,
  children,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Content>) {
  return (
    <DialogPortal>
      <DialogOverlay />
      <DialogPrimitive.Content
        data-slot="dialog-content"
        // The scroll padding keeps what the keyboard reaches clear of DialogHeader, a title of two lines and a focus ring
        // included, so it must keep up with the header's height.
        className={cn(
          "fixed inset-0 z-50 grid scroll-pt-22 content-start gap-4 overflow-y-auto bg-popover p-4 text-popover-foreground duration-100 outline-hidden sm:inset-auto sm:top-1/2 sm:left-1/2 sm:max-h-[calc(100svh-2rem)] sm:w-full sm:max-w-xl sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-xl sm:ring-1 sm:ring-foreground/10 motion-safe:data-open:animate-in data-open:fade-in-0 sm:data-open:zoom-in-95 motion-safe:data-closed:animate-out data-closed:fade-out-0 sm:data-closed:zoom-out-95",
          className
        )}
        {...props}
      >
        {children}
      </DialogPrimitive.Content>
    </DialogPortal>
  )
}

/**
 * The title, with the close button beside it, held at the top while the rest scrolls beneath, as a phone has no Escape
 * key to close it by.
 */
function DialogHeader({
  className,
  children,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="dialog-header"
      // Over the content's padding to its edges, in its colour, so text scrolling beneath stays hidden. Sticking is measured
      // from inside that padding, so it sticks a padding's height higher. Its foot is drawn into the gap below, so that
      // stuck it keeps a little room under the title.
      className={cn(
        "sticky -top-4 z-10 -mx-4 -mt-4 -mb-2 flex items-start justify-between gap-2 bg-popover px-4 pt-4 pb-2",
        className
      )}
      {...props}
    >
      {children}
      <DialogPrimitive.Close data-slot="dialog-close" asChild>
        <Button variant="ghost" className="-mr-1" size="icon-sm">
          <XIcon />
          <span className="sr-only">Close</span>
        </Button>
      </DialogPrimitive.Close>
    </div>
  )
}

function DialogTitle({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Title>) {
  return (
    <DialogPrimitive.Title
      data-slot="dialog-title"
      className={cn("min-w-0 font-heading text-lg font-medium", className)}
      {...props}
    />
  )
}

function DialogDescription({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Description>) {
  return (
    <DialogPrimitive.Description
      data-slot="dialog-description"
      className={cn("text-sm text-muted-foreground", className)}
      {...props}
    />
  )
}

export { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription }
