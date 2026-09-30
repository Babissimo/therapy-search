import type { ReactNode } from "react";
import { Masthead } from "@/layout/Masthead";
import type { useRememberedScroll } from "./viewMemory";

type Props = {
  wide: boolean;
  /** The tabs between the results and the shortlist. */
  tabs: ReactNode;
  /** The toolbar and filter chips, above the tabs on a phone; wide screens set them to the list's right instead. */
  top: ReactNode;
  scroll: ReturnType<typeof useRememberedScroll>;
  children: ReactNode;
};

/** The results and shortlist taking the page, where there is no map for them to sit beside. */
export function ListColumn({ wide, tabs, top, scroll, children }: Props) {
  const onScroll = (e: { currentTarget: HTMLElement }) => scroll.save(e.currentTarget.scrollTop);
  return (
    // The site's name heads the list alone, leaving what stands to its right the window's full height.
    <div className="flex min-w-0 flex-1 flex-col">
      {wide && <Masthead className="border-b px-4 py-3" />}
      {/* The list is positioned so that visually hidden text is placed inside it rather than stretching the page. */}
      <section aria-label="Results and shortlist" className="relative flex min-h-0 flex-1 flex-col">
        {wide ? (
          <>
            <div className="border-b px-4 py-2">
              <div className="mx-auto max-w-2xl">{tabs}</div>
            </div>
            <div ref={scroll.ref} onScroll={onScroll} className="relative min-h-0 flex-1 overflow-y-auto p-4">
              <div className="mx-auto max-w-2xl">{children}</div>
            </div>
          </>
        ) : (
          // On a phone the site's name and the toolbar scroll away with the list, leaving it the screen; its tabs stay.
          <div ref={scroll.ref} onScroll={onScroll} className="relative min-h-0 flex-1 overflow-y-auto">
            <Masthead className="border-b px-4 py-3" />
            <div className="space-y-2 p-3">{top}</div>
            <div className="sticky top-0 z-10 border-b bg-background px-4 py-2">{tabs}</div>
            <div className="p-4">{children}</div>
          </div>
        )}
      </section>
    </div>
  );
}
