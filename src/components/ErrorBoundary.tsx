import type { ReactNode } from "react";
import { UKCP_ORIGIN } from "@shared/query";
import { HelpNow } from "@/layout/HelpNow";
import { SITE_NAME } from "@/lib/useTitle";
import { REPORT_URL } from "@/site";
import { LoadFailed } from "./LoadFailed";

/**
 * In place of the page when drawing it throws, which would otherwise leave it blank: what went wrong in plain words, a
 * reload, the plain search, UKCP's own directory, where to report it, and where to turn for help today. Laid out by the
 * `fallback` rules in index.html's head, which need nothing of the build's styles.
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
        to try again, or use the <a href="/plain">plain search</a>, which works without this page. UKCP's own directory lists
        the same therapists too: <a href={`${UKCP_ORIGIN}/find-a-therapist/`}>find a therapist on the UKCP website</a>.
      </p>
      <p>
        If this keeps happening, please <a href={REPORT_URL}>report a problem</a> on <span translate="no">GitHub</span>.
      </p>
      <HelpNow />
    </main>
  );
}
