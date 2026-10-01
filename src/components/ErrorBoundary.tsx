import type { ReactNode } from "react";
import { UKCP_ORIGIN } from "@shared/query";
import { SITE_NAME } from "@/lib/useTitle";
import { LoadFailed } from "./LoadFailed";

/**
 * In place of the page when drawing it throws, which would otherwise leave it blank: what went wrong in plain words, a
 * reload, and UKCP's own directory. Laid out as index.html's fallback is, with its `fallback` class.
 */
export function ErrorBoundary({ children }: { children: ReactNode }) {
  return <LoadFailed fallback={<PageFailed />}>{children}</LoadFailed>;
}

function PageFailed() {
  return (
    <main className="fallback">
      <h1>{SITE_NAME}</h1>
      <p>Something went wrong on this page.</p>
      <p>
        <button type="button" className="underline" onClick={() => window.location.reload()}>
          Reload the page
        </button>{" "}
        to try again, or search UKCP's own directory, which lists the same therapists:{" "}
        <a href={`${UKCP_ORIGIN}/find-a-therapist/`}>find a therapist on the UKCP website</a>.
      </p>
    </main>
  );
}
