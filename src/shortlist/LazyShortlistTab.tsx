import { lazy, Suspense, useEffect, type ComponentProps } from "react";
import { LoadFailed } from "@/components/LoadFailed";
import type { ShortlistTab } from "./ShortlistTab";

type Loaded = { default: typeof ShortlistTab };

/** The tab, once its chunk is here. */
let loaded: Loaded | undefined;

/** The shortlist's tab and dnd-kit, which reorders it, in a chunk of their own that the page's first render never waits for. */
export const loadShortlistTab = () => import("./ShortlistTab").then((module) => (loaded = { default: module.ShortlistTab }));

const Tab = lazy(() => {
  const tab = loaded;
  // lazy suspends for a render on any promise, even a settled one, but reads a thenable that calls back at once in the
  // render itself, so a tab whose chunk is here is drawn as it opens.
  return tab ? ({ then: (take: (value: Loaded) => void) => take(tab) } as unknown as Promise<Loaded>) : loadShortlistTab();
});

/** The shortlist's tab, drawn once its chunk is here; it fades in as it comes. */
export function LazyShortlistTab(props: ComponentProps<typeof ShortlistTab>) {
  const failed = (
    <p className="py-2 text-sm">Your shortlist couldn't be shown just now. It's still kept in this browser: reload the page to see it.</p>
  );
  return (
    <LoadFailed fallback={failed}>
      <Suspense>
        <Tab {...props} />
      </Suspense>
    </LoadFailed>
  );
}

/** Fetches the shortlist's chunk once the page that offers its tab is drawn and the browser has a moment, so it is seldom waited for. */
export function usePreloadShortlistTab(): void {
  useEffect(() => {
    const preload = () => void loadShortlistTab().catch(() => {});
    // Where the browser has no idle callback, a second's wait stands in.
    if (!("requestIdleCallback" in window)) {
      const timer = setTimeout(preload, 1000);
      return () => clearTimeout(timer);
    }
    const idle = requestIdleCallback(preload, { timeout: 5000 });
    return () => cancelIdleCallback(idle);
  }, []);
}
