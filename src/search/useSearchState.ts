import { useCallback, useMemo } from "react";
import { useSearchParams } from "react-router";
import { ALLOWED } from "@shared/options";
import { InvalidParam, readParams, toQuery, type SearchParams } from "@shared/query";

/** The search lives in the query string after the page's `#`, in UKCP's own parameter names. */
export function useSearchState() {
  const [query, setQuery] = useSearchParams();
  const key = query.toString();
  const { params, error } = useMemo(() => {
    try {
      // Results grow with "Load more" rather than by page, so a page named in a link is ignored.
      return { params: { ...readParams(new URLSearchParams(key), ALLOWED), page: 1 }, error: null };
    } catch (e) {
      if (e instanceof InvalidParam) return { params: null, error: e };
      throw e;
    }
  }, [key]);
  // Replacing rather than pushing history matches UKCP, whose page rewrites its URL in place. An unchanged search keeps
  // its history entry, and with it the list's scroll and the map's view.
  const update = useCallback(
    (next: SearchParams) => {
      if (params && toQuery(next) === toQuery(params)) return;
      setQuery(toQuery(next), { replace: true });
    },
    [params, setQuery],
  );
  return { params, error, update };
}
