/** Cross-fades the whole page from how it looks to how `change` leaves it, where the browser can and motion is welcome. */
export function crossFade(change: () => void) {
  if (!("startViewTransition" in document) || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return change();
  // Skipped in a hidden tab or by another transition, when it still makes the change but rejects `ready`.
  document.startViewTransition(change).ready.catch(() => {});
}
