import { MapPin, Video } from "lucide-react";
import { useEffect, useRef, type MouseEvent } from "react";
import { Link } from "react-router";
import { toQuery, type SearchParams } from "@shared/query";
import { nearMeParams, ONLINE_PATH, onlineParams, rememberPlace } from "./online";

// As the side bar's tabs look, full width, the page showing marked as the open tab.
const OPTION =
  "flex flex-1 items-center justify-center gap-1.5 rounded-md border border-transparent px-2 py-0.5 text-sm font-medium text-foreground/60 transition-all hover:text-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-1 focus-visible:outline-ring dark:text-muted-foreground aria-[current=page]:bg-background aria-[current=page]:text-foreground aria-[current=page]:shadow-sm dark:aria-[current=page]:border-input dark:aria-[current=page]:bg-input/30";

// Set as the switch is used, so the switch the new page draws takes over the keyboard from the one it replaced.
let switching = false;

type Props = { online: boolean; params: SearchParams };

/** Between the map of therapists near a place and the list of those working online or by phone, either taking the search's filters to the other. */
export function ModeSwitch({ online, params }: Props) {
  const near = online ? nearMeParams(params) : params;
  const remote = online ? params : onlineParams(params);
  const current = useRef<HTMLAnchorElement>(null);
  useEffect(() => {
    if (switching) current.current?.focus();
    switching = false;
  }, []);
  // Whichever search near a place was last on show, however online is reached from it.
  useEffect(() => {
    if (!online) rememberPlace(params);
  });
  return (
    <nav aria-label="Where to meet" className="flex h-8 rounded-lg bg-muted p-[3px]">
      <Link
        ref={online ? undefined : current}
        to={{ pathname: "/", search: toQuery(near) }}
        aria-current={online ? undefined : "page"}
        onClick={(e) => (switching = online && inPlace(e))}
        className={OPTION}
      >
        <MapPin aria-hidden className="size-4 shrink-0" />
        Near me
      </Link>
      <Link
        ref={online ? current : undefined}
        to={{ pathname: ONLINE_PATH, search: toQuery(remote) }}
        aria-current={online ? "page" : undefined}
        onClick={(e) => (switching = !online && inPlace(e))}
        className={OPTION}
      >
        <Video aria-hidden className="size-4 shrink-0" />
        Online
      </Link>
    </nav>
  );
}

/** Whether a click follows the link in this tab, rather than opening it in another. */
function inPlace(e: MouseEvent) {
  return e.button === 0 && !(e.metaKey || e.ctrlKey || e.shiftKey || e.altKey);
}
