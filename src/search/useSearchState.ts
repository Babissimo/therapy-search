import { useCallback, useMemo } from "react";
import { matchPath, useLocation, useSearchParams } from "react-router";
import { onlineSearch } from "@shared/online";
import { ALLOWED } from "@shared/options";
import { InvalidParam, readParams, toQuery, type SearchParams } from "@shared/query";
import { backgroundOf } from "@/lib/drawerRoute";
import { isSearchPage, ONLINE_PATH } from "./online";

/** The search lives in the query string after the page's `#`, in UKCP's own parameter names. */
export function useSearchState() {
  const [query, setQuery] = useSearchParams();
  const key = query.toString();
  const { params, error } = useMemo(() => {
    try {
      return { params: readSearch(key), error: null };
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

/** The search a query string asks for. Results grow with "Load more" rather than by page, so a page named in it is ignored. */
export function readSearch(query: string): SearchParams {
  return { ...readParams(new URLSearchParams(query), ALLOWED), page: 1 };
}

/** The search the view at `pathname` shows for a query string, which online keeps to the sessions had remotely. */
export function viewSearch(pathname: string, query: string): SearchParams {
  const params = readSearch(query);
  return matchPath(ONLINE_PATH, pathname) ? onlineSearch(params) : params;
}

/**
 * The search on screen: the search page's own, or the one beneath a drawer opened over it. Nothing on any other page, or
 * for a search UKCP's form couldn't send.
 */
export function useShownParams(): SearchParams | undefined {
  const location = useLocation();
  const { pathname, search } = backgroundOf(location) ?? location;
  return useMemo(() => {
    if (!isSearchPage(pathname)) return undefined;
    try {
      return viewSearch(pathname, search);
    } catch (error) {
      if (error instanceof InvalidParam) return undefined;
      throw error;
    }
  }, [pathname, search]);
}

/** The search on screen as one query, which is what a result card's bookmark keeps. Nothing where nothing is searched. */
export function useShownSearch(): string | undefined {
  const params = useShownParams();
  return params && (toQuery(params) || undefined);
}
