import { useLayoutEffect, useState, type ReactNode } from "react";
import { Morph } from "@/components/Morph";
import { Masthead } from "@/layout/Masthead";
import { cn } from "@/lib/utils";
import type { useRememberedScroll } from "./viewMemory";

type Props = {
  wide: boolean;
  /** The tabs between the results and the shortlist, while there are any. */
  tabs?: ReactNode;
  /** The toolbar and filter chips, beneath the tabs on a phone; wide screens set them to the list's right instead. */
  top: ReactNode;
  /** Hides `top`, keeping what is typed or open in it. */
  topHidden: boolean;
  scroll: ReturnType<typeof useRememberedScroll>;
  /** On a phone, the button beside the tabs that shows the map in the list's place, and the list again. */
  toggle?: ReactNode;
  /**
   * On a phone, the list's map, once asked for: in the list's place while `mapShown`, hidden otherwise. It is given the
   * place for its zoom buttons, below the toolbar, or null until that is drawn.
   */
  map?: (zoomTo: HTMLElement | null) => ReactNode;
  mapShown?: boolean;
  children: ReactNode;
};

/** The results and shortlist taking the page, with a map, if any, a button away. */
export function ListColumn({ wide, tabs, top, topHidden, scroll, toggle, map, mapShown = false, children }: Props) {
  const onScroll = (e: { currentTarget: HTMLElement }) => scroll.save(e.currentTarget.scrollTop);
  // On a phone, the bar the tabs and the map's button stay stuck in atop the list.
  const tabBar = Boolean(tabs || toggle);
  // Whatever takes the keyboard beneath the tabs is scrolled into view clear of them.
  const belowTabs = tabBar && "[&_*]:scroll-mt-[calc(var(--list-tabs)+0.5rem)]";
  const [zoomSlot, setZoomSlot] = useState<HTMLDivElement | null>(null);
  // As the map shows, the column scrolls to its end, where the map fills the window below the tabs.
  useLayoutEffect(() => {
    const column = scroll.ref.current;
    if (mapShown && column) column.scrollTop = column.scrollHeight;
  }, [mapShown, scroll.ref]);
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
            {tabs && (
              <div className="border-b px-4 py-2 print:hidden">
                <div className="mx-auto max-w-2xl">{tabs}</div>
              </div>
            )}
            <Morph name="list">
              <div ref={scroll.ref} onScroll={onScroll} className="relative min-h-0 flex-1 overflow-y-auto p-4 print:overflow-visible print:pb-0">
                <div className="mx-auto max-w-2xl">{children}</div>
              </div>
            </Morph>
          </>
        ) : (
          // On a phone the site's name and the toolbar scroll away with the list, leaving it the screen, while the tabs stay; the
          // toolbar comes beneath the tabs, as it acts on the results alone. The map takes the list's place, as tall as the
          // window below the tabs, and while it shows the list's scroll is kept as it was rather than recorded. A short wide
          // window centres all but the site's name at the list's width.
          //
          // The map stays put as the column scrolls, stuck to its foot beneath the rest: the toolbar slides out from under the
          // tabs over it, then the tabs and the site's name, with the map's zoom buttons riding below the toolbar.
          <Morph name="list">
            <div
              ref={scroll.ref}
              onScroll={mapShown ? undefined : onScroll}
              // The tabs' height: their controls, h-8 or h-11 on a touch screen, with the bar's padding and border.
              className="relative isolate min-h-0 flex-1 overflow-y-auto [--list-tabs:calc(3rem+1px)] pointer-coarse:[--list-tabs:calc(3.75rem+1px)] print:overflow-visible"
            >
              <Masthead className="border-b bg-background px-4 py-3" />
              {/* Marked, so a pin's place in the list can be brought into view below it. */}
              {tabBar && (
                <div data-list-tabs className="sticky top-0 z-10 h-(--list-tabs) border-b bg-background px-4 py-2 print:hidden">
                  <div className="mx-auto flex max-w-2xl items-center justify-between gap-2">
                    {tabs}
                    {toggle}
                  </div>
                </div>
              )}
              <div hidden={topHidden} className={cn("bg-background px-3 pt-3 print:hidden", belowTabs)}>
                <div className="mx-auto max-w-2xl space-y-2">{top}</div>
              </div>
              {/* Printed though the map is in its place on screen. */}
              <div className={cn("p-4 print:pb-0", belowTabs, mapShown && "not-print:hidden")}>
                <div className="mx-auto max-w-2xl">{children}</div>
              </div>
              {map && (
                <>
                  <div ref={setZoomSlot} hidden={!mapShown} className="relative h-0 print:hidden" />
                  {/* A child of the column itself, as a sticky box keeps within its parent. */}
                  <div hidden={!mapShown} className="sticky bottom-0 -z-1 h-[calc(100%-var(--list-tabs))] print:hidden">
                    {map(zoomSlot)}
                  </div>
                </>
              )}
            </div>
          </Morph>
        )}
      </section>
    </div>
  );
}
