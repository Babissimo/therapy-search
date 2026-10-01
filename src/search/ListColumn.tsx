import type { ReactNode } from "react";
import { Morph } from "@/components/Morph";
import { Masthead } from "@/layout/Masthead";
import type { useRememberedScroll } from "./viewMemory";

type Props = {
  wide: boolean;
  /** The tabs between the results and the shortlist. */
  tabs: ReactNode;
  /** The toolbar and filter chips, above the tabs on a phone; wide screens set them to the list's right instead. */
  top: ReactNode;
  /** Hides `top`, keeping what is typed or open in it. */
  topHidden: boolean;
  scroll: ReturnType<typeof useRememberedScroll>;
  children: ReactNode;
};

/** The results and shortlist taking the page, where there is no map for them to sit beside. */
export function ListColumn({ wide, tabs, top, topHidden, scroll, children }: Props) {
  const onScroll = (e: { currentTarget: HTMLElement }) => scroll.save(e.currentTarget.scrollTop);
  return (
    // The site's name heads the list alone, leaving what stands to its right the window's full height.
    <div className="flex min-w-0 flex-1 flex-col print:block">
      {wide && <Masthead className="border-b px-4 py-3" />}
      {/* The list is positioned so that visually hidden text is placed inside it rather than stretching the page. */}
      <section aria-label="Results and shortlist" className="relative flex min-h-0 flex-1 flex-col print:block">
        {/* Printed, the open list runs on unclipped, without the tabs, in blocks rather than flex boxes, which not every
            browser carries over a page break. */}
        {wide ? (
          <>
            <div className="border-b px-4 py-2 print:hidden">
              <div className="mx-auto max-w-2xl">{tabs}</div>
            </div>
            <Morph name="list">
              <div ref={scroll.ref} onScroll={onScroll} className="relative min-h-0 flex-1 overflow-y-auto p-4 print:overflow-visible print:pb-0">
                <div className="mx-auto max-w-2xl">{children}</div>
              </div>
            </Morph>
          </>
        ) : (
          // On a phone the site's name and the toolbar scroll away with the list, leaving it the screen; its tabs stay.
          <Morph name="list">
            <div ref={scroll.ref} onScroll={onScroll} className="relative min-h-0 flex-1 overflow-y-auto print:overflow-visible">
              <Masthead className="border-b px-4 py-3" />
              <div hidden={topHidden} className="space-y-2 p-3 print:hidden">
                {top}
              </div>
              <div className="sticky top-0 z-10 border-b bg-background px-4 py-2 print:hidden">{tabs}</div>
              <div className="p-4 print:pb-0">{children}</div>
            </div>
          </Morph>
        )}
      </section>
    </div>
  );
}
