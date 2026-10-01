export type Skip = { label: string; onSkip: () => void };

// About a third of a second of frames, longer than anything takes to slide into view.
const FOCUS_TRIES = 20;

/** Focuses what `find` finds as soon as it can take focus, as something sliding into view can't until it shows. */
export function focusOnceShown(find: () => HTMLElement | null | undefined, tries = FOCUS_TRIES) {
  const target = find();
  target?.focus();
  if (target && document.activeElement !== target && tries > 0) requestAnimationFrame(() => focusOnceShown(find, tries - 1));
}

/**
 * Links first in the page, out of sight until one takes focus, that carry the keyboard past what comes first to where it
 * is wanted. The page's address lives after the #, which an anchor would change, so each moves focus itself.
 */
export function SkipLinks({ skips }: { skips: Skip[] }) {
  return (
    <nav aria-label="Skip links">
      {skips.map(({ label, onSkip }) => (
        <a
          key={label}
          href="#"
          onClick={(event) => {
            event.preventDefault();
            onSkip();
          }}
          className="sr-only rounded-md focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-2000"
        >
          {/* Its box is the span's, as not-sr-only takes the link's padding away. */}
          <span className="block rounded-md bg-background px-3 py-2 text-sm font-medium underline shadow-md">{label}</span>
        </a>
      ))}
    </nav>
  );
}
