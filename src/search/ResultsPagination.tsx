import type { MouseEvent } from "react";
import { Pagination, PaginationContent, PaginationEllipsis, PaginationItem, PaginationLink, PaginationNext, PaginationPrevious } from "@/components/ui/pagination";
import { pageWindow } from "./pageWindow";

type Props = { page: number; totalPages: number; hrefFor: (page: number) => string; onPage: (page: number) => void };

export function ResultsPagination({ page, totalPages, hrefFor, onPage }: Props) {
  // Real hrefs keep "open in new tab" working; a plain click stays in the app.
  const go = (target: number) => (event: MouseEvent<HTMLAnchorElement>) => {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    onPage(target);
    window.scrollTo({ top: 0 });
  };

  return (
    <Pagination>
      <PaginationContent>
        {page > 1 && (
          <PaginationItem>
            <PaginationPrevious href={hrefFor(page - 1)} onClick={go(page - 1)} />
          </PaginationItem>
        )}
        {pageWindow(page, totalPages).map((slot, i) =>
          slot === "gap" ? (
            <PaginationItem key={`gap-${i}`}>
              <PaginationEllipsis />
            </PaginationItem>
          ) : (
            <PaginationItem key={slot}>
              <PaginationLink href={hrefFor(slot)} isActive={slot === page} onClick={go(slot)}>
                {slot}
              </PaginationLink>
            </PaginationItem>
          ),
        )}
        {page < totalPages && (
          <PaginationItem>
            <PaginationNext href={hrefFor(page + 1)} onClick={go(page + 1)} />
          </PaginationItem>
        )}
      </PaginationContent>
    </Pagination>
  );
}
