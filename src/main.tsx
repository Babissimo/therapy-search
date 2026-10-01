import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { fragmentAddress } from "./lib/address";
import { queryClient } from "./lib/queryClient";
import { prefetchSearchAt } from "./search/prefetch";
import "./index.css";

const address = fragmentAddress(new URL(window.location.href));
if (address) window.history.replaceState(null, "", address);
prefetchSearchAt(queryClient, window.location.hash);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
