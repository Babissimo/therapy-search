import { useCallback, useState } from "react";

/**
 * Whether a sticky element has stuck, for one set a pixel above its scroller's top (`-top-px`), where the scroller clips
 * that pixel off once it sticks. Clipped at a side instead, as a drawer slides in, it hasn't stuck; nor has it while it
 * isn't sticky, however far it has scrolled.
 */
export function useStuck(): [ref: (element: Element | null) => (() => void) | undefined, stuck: boolean] {
  const [stuck, setStuck] = useState(false);
  const ref = useCallback((element: Element | null) => {
    if (!element) return undefined;
    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries.at(-1);
        if (entry) setStuck(getComputedStyle(element).position === "sticky" && entry.intersectionRect.top > entry.boundingClientRect.top);
      },
      // Told only as it comes into or out of full view, so a window's height below the window counts as in view, for one whose
      // foot starts out of sight. A scroller other than the window clips the foot regardless: there it must be seen whole first.
      { threshold: 1, rootMargin: "0px 0px 100% 0px" },
    );
    observer.observe(element);
    // A resize can make it sticky or not without its coming into or out of full view; watched anew, it is reported at once.
    const look = () => {
      observer.unobserve(element);
      observer.observe(element);
    };
    window.addEventListener("resize", look);
    return () => {
      window.removeEventListener("resize", look);
      observer.disconnect();
    };
  }, []);
  return [ref, stuck];
}
