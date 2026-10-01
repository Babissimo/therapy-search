import { lazy, Suspense, type ComponentProps } from "react";
import { LoadFailed } from "@/components/LoadFailed";
import type { StatusTrack } from "./StatusTrack";

/** The track, its menu and Radix's dropdown, in a chunk the shortlist's tab imports too, so the tab's preload fetches it. */
const Track = lazy(() => import("./StatusTrack").then((module) => ({ default: module.StatusTrack })));

/** The status track, drawn once its chunk is here, for a page in the main chunk. */
export function LazyStatusTrack(props: ComponentProps<typeof StatusTrack>) {
  const failed = (
    <p className="text-sm">
      Where you stand with {props.therapist.name} couldn't be shown just now. It's still kept in this browser: reload the page to see it.
    </p>
  );
  return (
    <LoadFailed fallback={failed}>
      <Suspense>
        <Track {...props} />
      </Suspense>
    </LoadFailed>
  );
}
