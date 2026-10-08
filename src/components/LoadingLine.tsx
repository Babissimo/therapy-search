import { Loader2 } from "lucide-react";
import { useEffect, useState } from "react";

/**
 * Says what the visitor asked for is on its way, in a polite status region. Its words come just after its region, as a
 * screen reader misses text that arrives with its region.
 */
export function LoadingLine({ children }: { children: string }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return (
    // At the words' height before they come.
    <p role="status" className="flex min-h-5 items-center gap-1.5 text-sm text-muted-foreground">
      <Loader2 aria-hidden className="size-4 shrink-0 motion-safe:animate-spin" />
      {mounted && children}
    </p>
  );
}
