import type { ReactNode } from "react";
import { UKCP_ORIGIN } from "@shared/query";
import { HelpNow } from "@/layout/HelpNow";
import { SITE_NAME } from "@/lib/useTitle";
import { REPORT_URL } from "@/site";
import { LoadFailed } from "./LoadFailed";

/**
 * In place of the page when drawing it throws, which would otherwise leave it blank: what went wrong in plain words, a
 * reload, UKCP's own directory, where to report it, and where to turn for help today. Laid out as index.html's fallback
 * is, with its `fallback` class.
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
      <p>
        If this keeps happening, please <a href={REPORT_URL}>report a problem</a> on <span translate="no">GitHub</span>.
      </p>
      <HelpNow />
    </main>
  );
}
