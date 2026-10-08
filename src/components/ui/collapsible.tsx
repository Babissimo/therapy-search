import * as React from "react"
import { cn } from "cn"
import { Collapsible as CollapsiblePrimitive } from "radix-ui"

function Collapsible({ ...props }: React.ComponentProps<typeof CollapsiblePrimitive.Root>) {
  return <CollapsiblePrimitive.Root data-slot="collapsible" {...props} />
}

function CollapsibleTrigger({ ...props }: React.ComponentProps<typeof CollapsiblePrimitive.CollapsibleTrigger>) {
  return <CollapsiblePrimitive.CollapsibleTrigger data-slot="collapsible-trigger" {...props} />
}

/**
 * A collapsible's content's ref, marking it `data-unrolled` from when it has unrolled, or been hidden as it did, until it
 * rolls up, so it unrolls as it opens rather than each time it shows again after something around it hid it.
 */
function unrolls(content: HTMLElement | null) {
  if (!content) return undefined
  const mark = (event: AnimationEvent) => {
    if (event.target !== content) return
    if (content.dataset.state === "closed") delete content.dataset.unrolled
    // Its roll-down, rather than the roll-up that reopening cut short.
    else if (event.type !== "animationstart" && getComputedStyle(content).animationName.split(", ").includes(event.animationName))
      content.dataset.unrolled = ""
  }
  const types = ["animationstart", "animationend", "animationcancel"] as const
  types.forEach((type) => content.addEventListener(type, mark))
  return () => types.forEach((type) => content.removeEventListener(type, mark))
}

/** Unrolls to its height as it opens and rolls back up as it closes, as the accordion's content does. */
function CollapsibleContent({ className, ...props }: React.ComponentProps<typeof CollapsiblePrimitive.CollapsibleContent>) {
  return (
    <CollapsiblePrimitive.CollapsibleContent
      data-slot="collapsible-content"
      className={cn(
        "overflow-hidden motion-safe:data-open:not-data-unrolled:animate-collapsible-down motion-safe:data-closed:animate-collapsible-up",
        className
      )}
      ref={unrolls}
      {...props}
    />
  )
}

export { Collapsible, CollapsibleTrigger, CollapsibleContent, unrolls }
