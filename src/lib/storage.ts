/** `localStorage`, or null where the browser refuses access to it. */
export function browserStorage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/** `sessionStorage`, kept for the tab, or null where the browser refuses access to it. */
export function tabStorage(): Storage | null {
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}
