import { browserStorage } from "@/lib/storage";
import { createStore, useStore } from "@/lib/store";

export type ThemeChoice = "light" | "system" | "dark";

// index.html reads the same key to apply the theme before first paint.
const KEY = "theme";

type ThemeStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export function storedTheme(storage: ThemeStorage | null = browserStorage()): ThemeChoice {
  try {
    const stored = storage?.getItem(KEY);
    return stored === "light" || stored === "dark" ? stored : "system";
  } catch {
    // Read as this module loads, so a refused read falls back rather than throwing.
    return "system";
  }
}

/** Keeps a light or dark choice; "system" is the absence of one, so nothing is stored for it. */
export function storeTheme(choice: ThemeChoice, storage: ThemeStorage | null = browserStorage()) {
  try {
    if (choice === "system") storage?.removeItem(KEY);
    else storage?.setItem(KEY, choice);
  } catch {
    // Private browsing can refuse writes; the choice then lasts for this page load only, in `pageChoice`.
  }
}

// Every theme switch reads the choice from here, so one drawn afresh shows it even where storage refused it.
const pageChoice = createStore(storedTheme());

/** The visitor's choice for this page load, redrawing the caller as it changes. */
export function useThemeChoice(): ThemeChoice {
  return useStore(pageChoice);
}

/** Makes `choice` the page's, keeping it in storage too where the browser allows. */
export function chooseTheme(choice: ThemeChoice) {
  storeTheme(choice);
  pageChoice.set(choice);
}

export function applyTheme(choice: ThemeChoice, systemDark: boolean, root: HTMLElement = document.documentElement) {
  root.classList.toggle("dark", choice === "dark" || (choice === "system" && systemDark));
}
