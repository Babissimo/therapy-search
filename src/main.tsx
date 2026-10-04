import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { fragmentAddress } from "./lib/address";
import { queryClient } from "./lib/queryClient";
import { prefetchSearchAt } from "./search/prefetch";
import { browserShortlist } from "./shortlist/useShortlist";
import "./index.css";

// index.html marks a browser older than the build needs, which it offers the plain search; one that can still parse this
// script is left with that offer rather than a page its styles would break.
if (!document.documentElement.classList.contains("old-browser")) {
  const address = fragmentAddress(new URL(window.location.href));
  if (address) window.history.replaceState(null, "", address);
  prefetchSearchAt(queryClient, window.location.hash);
  // Made as any page loads, the accessibility statement too, so those removed from the shortlist long enough ago are forgotten whichever opens.
  browserShortlist();

  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    </StrictMode>,
  );
}
