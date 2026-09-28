import { browserStorage } from "@/lib/storage";

export type ThemeChoice = "light" | "system" | "dark";

// index.html reads the same key to apply the theme before first paint.
const KEY = "theme";

type ThemeStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export function storedTheme(storage: ThemeStorage | null = browserStorage()): ThemeChoice {
  const stored = storage?.getItem(KEY);
  return stored === "light" || stored === "dark" ? stored : "system";
}

/** Keeps a light or dark choice; "system" is the absence of one, so nothing is stored for it. */
export function storeTheme(choice: ThemeChoice, storage: ThemeStorage | null = browserStorage()) {
  try {
    if (choice === "system") storage?.removeItem(KEY);
    else storage?.setItem(KEY, choice);
  } catch {
    // Private browsing can refuse writes; the choice then lasts for this page load only.
  }
}

export function applyTheme(choice: ThemeChoice, systemDark: boolean, root: HTMLElement = document.documentElement) {
  root.classList.toggle("dark", choice === "dark" || (choice === "system" && systemDark));
}
