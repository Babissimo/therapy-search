import { MapPin, Video } from "lucide-react";
import { useEffect, useRef, type MouseEvent } from "react";
import { Link, useNavigate, type To } from "react-router";
import { toQuery, type SearchParams } from "@shared/query";
import { startMorph } from "@/components/Morph";
import { nearMeParams, ONLINE_PATH, onlineParams, rememberPlace } from "./online";
import { useDraftSearch, type SearchDrafts } from "./useSearchDrafts";

// As the side bar's tabs look, full width, the page showing marked as the open tab.
const OPTION =
  "relative flex flex-1 items-center justify-center gap-1.5 rounded-md touch-target border border-transparent px-2 py-0.5 text-sm font-medium text-muted-foreground transition-all hover:text-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-1 focus-visible:outline-ring aria-[current=page]:bg-background aria-[current=page]:text-foreground aria-[current=page]:shadow-sm dark:aria-[current=page]:border-input dark:aria-[current=page]:bg-input/30 aria-[current=page]:forced-chosen";

// Set as the switch is used, so the switch the new page draws takes over the keyboard from the one it replaced.
let switching = false;

type Props = { online: boolean; params: SearchParams; drafts: SearchDrafts };

/**
 * Between the map of therapists near a place and the list of those working online or by phone, either taking the
 * search's filters to the other, with any ticks and keyword still waiting in its draft.
 */
export function ModeSwitch({ online, params, drafts }: Props) {
  // The other view takes the draft; neither reads its typed place. This one's link stays the search on show.
  const draft = useDraftSearch(drafts);
  const near = online ? nearMeParams(draft) : params;
  const remote = online ? params : onlineParams(draft);
  const current = useRef<HTMLAnchorElement>(null);
  const navigate = useNavigate();
  useEffect(() => {
    if (switching) current.current?.focus();
    switching = false;
  }, []);
  // Whichever search near a place was last on show, however online is reached from it.
  useEffect(() => {
    if (!online) rememberPlace(params);
  });
  const toNear = { pathname: "/", search: toQuery(near) };
  const toOnline = { pathname: ONLINE_PATH, search: toQuery(remote) };
  // Followed here rather than by the link, so the page's pieces glide from their places in one view to the other's, the place
  // to search sliding the way the switch goes.
  function leave(e: MouseEvent, to: To) {
    if (!inPlace(e)) return;
    e.preventDefault();
    switching = true;
    startMorph(() => navigate(to), online ? "to-near" : "to-online");
  }
  return (
    // Spaced under forced colours, where the focus outline round one option would run into the other's fill, both Highlight.
    <nav aria-label="Where to meet" className="flex h-8 rounded-lg bg-muted p-[3px] forced-colors:gap-2 pointer-coarse:h-11">
      <Link
        ref={online ? undefined : current}
        to={toNear}
        aria-current={online ? undefined : "page"}
        onClick={online ? (e) => leave(e, toNear) : undefined}
        className={OPTION}
      >
        <MapPin aria-hidden className="size-4 shrink-0" />
        Near me
      </Link>
      <Link
        ref={online ? current : undefined}
        to={toOnline}
        aria-current={online ? "page" : undefined}
        onClick={online ? undefined : (e) => leave(e, toOnline)}
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
