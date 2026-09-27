export type PageSlot = number | "gap";

/** First, last, and the pages either side of the current one, with gaps between runs. */
export function pageWindow(page: number, totalPages: number): PageSlot[] {
  const pages = [...new Set([1, page - 1, page, page + 1, totalPages])]
    .filter((p) => p >= 1 && p <= totalPages)
    .sort((a, b) => a - b);
  return pages.flatMap((p, i) => (i > 0 && p - pages[i - 1]! > 1 ? ["gap" as const, p] : [p]));
}
