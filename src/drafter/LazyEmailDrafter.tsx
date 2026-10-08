import { Suspense, useEffect, type ComponentProps } from "react";
import { ErrorLine } from "@/components/ErrorLine";
import { LoadFailed } from "@/components/LoadFailed";
import { LoadingLine } from "@/components/LoadingLine";
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
      <Suspense fallback={<LoadingLine>Opening the drafter</LoadingLine>}>
        <Drafter {...props} />
      </Suspense>
    </LoadFailed>
  );
}

/** Fetches the drafter's chunk while `wanted`, as a track that offers it draws, so it opens at once. */
export function usePreloadDrafter(wanted: boolean): void {
  useEffect(() => {
    if (wanted) void loadDrafter().catch(() => {});
  }, [wanted]);
}
