import { RotateCw } from "lucide-react";
import { Suspense, type ReactNode } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { LoadFailed } from "./LoadFailed";

/**
 * Where a lazily loaded map draws: a muted box while its code arrives, and a note in its place if the code can't be fetched.
 * Only a reload tries again, as React keeps a failed import's error and the browser may keep the failed fetch. Maps stay
 * off paper, where their tiles print in pieces and the words around them say where each place is.
 */
export function MapSlot({ children }: { children: ReactNode }) {
  return (
    // No box of its own on screen, so the map sizes to what holds the slot.
    <div className="contents print:hidden">
      <LoadFailed fallback={<MapFailed />}>
        <Suspense fallback={<div className="size-full bg-muted" />}>{children}</Suspense>
      </LoadFailed>
    </div>
  );
}

function MapFailed() {
  return (
    // A third of the way down, which on a phone keeps it clear of the search's toolbar above and its sheet half raised below.
    <div className="flex size-full flex-col items-center bg-muted p-3 before:flex-1 after:flex-2">
      {/* Read in its place rather than announced, as the words around a map say what it shows. */}
      <Alert role="note" className="w-auto max-w-xs">
        <AlertTitle>The map couldn't load.</AlertTitle>
        <AlertDescription>
          <Button type="button" variant="outline" size="sm" className="mt-1.5 text-foreground" onClick={() => window.location.reload()}>
            <RotateCw aria-hidden />
            Reload the page
          </Button>
        </AlertDescription>
      </Alert>
    </div>
  );
}
