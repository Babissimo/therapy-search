import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { fragmentAddress } from "./lib/address";
import "./index.css";

const address = fragmentAddress(new URL(window.location.href));
if (address) window.history.replaceState(null, "", address);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);
