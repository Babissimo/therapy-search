import { useLayoutEffect, type ReactNode } from "react";
import { Morph } from "@/components/Morph";
import { Masthead } from "@/layout/Masthead";
import { cn } from "@/lib/utils";
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
  /** On a phone, the button beside the tabs that shows the map in the list's place, and the list again. */
  toggle?: ReactNode;
  /** On a phone, the list's map, once asked for: in the list's place while `mapShown`, hidden otherwise. */
  map?: ReactNode;
  mapShown?: boolean;
  children: ReactNode;
};

/** The results and shortlist taking the page, with a map, if any, a button away. */
export function ListColumn({ wide, tabs, top, topHidden, scroll, toggle, map, mapShown = false, children }: Props) {
  const onScroll = (e: { currentTarget: HTMLElement }) => scroll.save(e.currentTarget.scrollTop);
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
          // On a phone the site's name and the toolbar scroll away with the list, leaving it the screen; its tabs stay. The map
          // takes the list's place, as tall as the window below the tabs, and while it shows the list's scroll is kept as it
          // was rather than recorded. A short wide window centres all but the site's name at the list's width.
          <Morph name="list">
            <div ref={scroll.ref} onScroll={mapShown ? undefined : onScroll} className="relative min-h-0 flex-1 overflow-y-auto print:overflow-visible">
              <Masthead className="border-b px-4 py-3" />
              <div hidden={topHidden} className="p-3 print:hidden">
                <div className="mx-auto max-w-2xl space-y-2">{top}</div>
              </div>
              <div className={cn(mapShown && "flex h-full flex-col print:block print:h-auto")}>
                {/* Marked, so a pin's place in the list can be brought into view below it. */}
                <div data-list-tabs className="sticky top-0 z-10 shrink-0 border-b bg-background px-4 py-2 print:hidden">
                  <div className="mx-auto flex max-w-2xl items-center justify-between gap-2">
                    {tabs}
                    {toggle}
                  </div>
                </div>
                {/* Printed though the map is in its place on screen. Whatever in it takes the keyboard scrolls into view clear of the
                    tabs stuck above it. */}
                <div className={cn("p-4 print:pb-0 [&_*]:scroll-mt-14 pointer-coarse:[&_*]:scroll-mt-17", mapShown && "not-print:hidden")}>
                  <div className="mx-auto max-w-2xl">{children}</div>
                </div>
                {map && (
                  <div hidden={!mapShown} className="min-h-0 flex-1">
                    {map}
                  </div>
                )}
              </div>
            </div>
          </Morph>
        )}
      </section>
    </div>
  );
}
