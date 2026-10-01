import { Component, type ReactNode } from "react";
import { UKCP_ORIGIN } from "@shared/query";

type State = { failed: boolean };

/**
 * In place of the page when drawing it throws, which would otherwise leave it blank: what went wrong in plain words, a
 * reload, and UKCP's own directory. Laid out as index.html's fallback is, with its `fallback` class.
 */
export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  override state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  override render() {
    if (!this.state.failed) return this.props.children;
    return (
      <main className="fallback">
        <h1>Find a UKCP therapist (unofficial)</h1>
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
}
