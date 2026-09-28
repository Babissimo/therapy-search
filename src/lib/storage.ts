/** `localStorage`, or null where the browser refuses access to it. */
export function browserStorage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}
