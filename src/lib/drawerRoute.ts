import { useEffect } from "react";
import { useLocation, useNavigate, type Location } from "react-router";
import { tabStorage } from "@/lib/storage";

/** A page opened in a drawer over another, such as a profile from the search, carries that page's location, which stays rendered beneath. */
export type DrawerState = { background?: Location };

/** The page a tab last opened in a drawer, by its path, and the page beneath it. */
type Opened = { pathname: string; background: Location };

/** Where the tab keeps the drawer it last opened, which index.html's shape script reads too. */
export const OPENED_KEY = "drawer-opened-over";

/**
 * The page a drawer's page was opened over, if it was. History keeps it with the drawer's entry, but entering the address
 * again makes that entry afresh without it, so the tab keeps it too, for the drawer it last opened. Kept by the tab rather
 * than in the address, so a profile's link never carries the search it was found by.
 */
export function backgroundOf(location: Location): Location | undefined {
  const background = carried(location);
  if (background) return background;
  const opened = lastOpened();
  return opened?.pathname === location.pathname ? opened.background : undefined;
}

/** The page history keeps with a drawer's entry, which it does for each drawer opened over one. */
function carried(location: Location): Location | undefined {
  return (location.state as DrawerState | null)?.background;
}

/** Keeps, for the tab, the page that history says the drawer at `location` was opened over. */
export function useKeepOpened(location: Location) {
  const { pathname } = location;
  const background = carried(location);
  useEffect(() => {
    if (!background) return;
    try {
      tabStorage()?.setItem(OPENED_KEY, JSON.stringify({ pathname, background } satisfies Opened));
    } catch {
      // Private browsing can refuse writes; the page then shows alone once its entry is made afresh.
    }
  }, [pathname, background]);
}

/**
 * Closes a drawer by going Back to the page beneath. A drawer the tab reopened at an entry made afresh may have nothing of
 * the site's behind it (the tab went elsewhere meanwhile), and puts the page in its entry's place instead.
 */
export function useCloseDrawer(): () => void {
  const navigate = useNavigate();
  const location = useLocation();
  return () => {
    const background = backgroundOf(location);
    if (carried(location) || !background || canGoBack()) navigate(-1);
    else navigate(background, { replace: true, state: background.state });
  };
}

/** Whether the tab has an entry of the site's before this one, taken as so where the browser can't say. */
function canGoBack(): boolean {
  return window.navigation?.canGoBack ?? true;
}

function lastOpened(): Opened | undefined {
  try {
    const opened = JSON.parse(tabStorage()?.getItem(OPENED_KEY) ?? "null") as Partial<Opened> | null;
    return typeof opened?.pathname === "string" && typeof opened.background?.pathname === "string" ? (opened as Opened) : undefined;
  } catch {
    return undefined;
  }
}

/** Links to pages that open in a drawer over the current page rather than in place of it. */
export function useDrawerLink(): (to: string) => { to: string; state: DrawerState } {
  const location = useLocation();
  return (to) => ({ to, state: { background: location } });
}
