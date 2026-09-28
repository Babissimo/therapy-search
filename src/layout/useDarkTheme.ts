import { useSyncExternalStore } from "react";

function subscribe(onChange: () => void) {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
  return () => observer.disconnect();
}

/** Whether the page is dark, following the class the theme switch sets on `<html>`. */
export function useDarkTheme(): boolean {
  return useSyncExternalStore(subscribe, () => document.documentElement.classList.contains("dark"));
}
