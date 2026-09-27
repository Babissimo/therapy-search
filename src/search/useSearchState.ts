import { useCallback, useMemo } from "react";
import { useSearchParams } from "react-router";
import { ALLOWED } from "@shared/options";
import { InvalidParam, readParams, toQuery, type SearchParams } from "@shared/query";

/** The search lives in the page's query string, in UKCP's own parameter names. */
export function useSearchState() {
  const [query, setQuery] = useSearchParams();
  const key = query.toString();
  const { params, error } = useMemo(() => {
    try {
      return { params: readParams(new URLSearchParams(key), ALLOWED), error: null };
    } catch (e) {
      if (e instanceof InvalidParam) return { params: null, error: e };
      throw e;
    }
  }, [key]);
  // Replacing rather than pushing history matches UKCP, whose page rewrites its URL in place.
  const update = useCallback((next: SearchParams) => setQuery(toQuery(next), { replace: true }), [setQuery]);
  return { params, error, update };
}
