import { useCallback, useState } from "react";

/**
 * Whether a sticky element has stuck, for one set a pixel above its scroller's top (`-top-px`), where the scroller clips
 * that pixel off once it sticks. Clipped at a side instead, as a drawer slides in, it hasn't stuck.
 */
export function useStuck(): [ref: (element: Element | null) => (() => void) | undefined, stuck: boolean] {
  const [stuck, setStuck] = useState(false);
  const ref = useCallback((element: Element | null) => {
    if (!element) return undefined;
    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries.at(-1);
        if (entry) setStuck(entry.intersectionRect.top > entry.boundingClientRect.top);
      },
      { threshold: 1 },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return [ref, stuck];
}
