import { Loader2 } from "lucide-react";
import { Suspense, useEffect, useState, type ComponentProps } from "react";
import { ErrorLine } from "@/components/ErrorLine";
import { LoadFailed } from "@/components/LoadFailed";
import { lazyChunk } from "@/lib/lazyChunk";
import type { EmailDrafter } from "./EmailDrafter";

/** The drafter, its dialog and the message it writes, in a chunk of their own. */
const { Component: Drafter, load: loadDrafter } = lazyChunk(() => import("./EmailDrafter").then((module) => module.EmailDrafter));

/** The drafter, drawn once its chunk is here, with a line in its place while the chunk comes or if it can't. */
export function LazyEmailDrafter(props: ComponentProps<typeof EmailDrafter>) {
  // Announced as it appears, since it answers the visitor's press, and focus stays on the button.
  const failed = <ErrorLine>The email drafter couldn't open just now. Reload the page to try again.</ErrorLine>;
  return (
    <LoadFailed fallback={failed}>
      <Suspense fallback={<Opening />}>
        <Drafter {...props} />
      </Suspense>
    </LoadFailed>
  );
}

/** Says the drafter is on its way. Its words come just after its region, as a screen reader misses text that arrives with its region. */
function Opening() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return (
    // At the words' height before they come.
    <p role="status" className="flex min-h-5 items-center gap-1.5 text-sm text-muted-foreground">
      <Loader2 aria-hidden className="size-4 shrink-0 motion-safe:animate-spin" />
      {mounted && "Opening the drafter"}
    </p>
  );
}

/** Fetches the drafter's chunk while `wanted`, as a track that offers it draws, so it opens at once. */
export function usePreloadDrafter(wanted: boolean): void {
  useEffect(() => {
    if (wanted) void loadDrafter().catch(() => {});
  }, [wanted]);
}
