import { Mail, Pause } from "lucide-react";
import { useLayoutEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { LazyEmailDrafter, usePreloadDrafter } from "@/drafter/LazyEmailDrafter";
import { cn } from "@/lib/utils";
import { STATUS_LABEL } from "./status";
import { StatusMenu } from "./StatusMenu";
import type { ShortlistCard, Status } from "./store";
import { useShortlistStore } from "./useShortlist";

/** The usual path, as the track draws it. */
const STEPS: readonly Status[] = ["toContact", "contacted", "consultation", "seeing"];

// The track's fills, for the steps taken and the path still ahead. Forced colours paint every background as the page's,
// so there they take the text's colour and the disabled text's.
const TAKEN = "bg-primary forced-colors:bg-[CanvasText]";
const AHEAD = "bg-border forced-colors:bg-[GrayText]";

/** Where the button moves a therapist on to, in its words; the path ends at "Seeing them", with none. */
const NEXT_STEP: Record<Status, { label: string; status: Status } | undefined> = {
  toContact: { label: "Mark contacted", status: "contacted" },
  contacted: { label: "Consultation booked", status: "consultation" },
  waiting: { label: "Consultation booked", status: "consultation" },
  consultation: { label: "Seeing them", status: "seeing" },
  seeing: undefined,
  setAside: { label: "Consider again", status: "toContact" },
};

/** The controls the track gives focus to as it redraws, by their attributes. */
type Refocus = "[data-status-menu]" | "[data-next-step]" | "[data-draft-email]";

type Props = {
  therapist: ShortlistCard;
  status: Status;
  /** Off the shortlist, the track shows where they stood and says they were removed, with nothing to change it until they are added back. */
  listed?: boolean;
  /** After the button or the menu gives the therapist a new status. */
  onChosen?: (status: Status) => void;
  /** After the menu takes the therapist off the shortlist. */
  onRemoved?: () => void;
};

/** Where the visitor stands with a therapist along the usual path, with the next step and the menu to change it. */
export function StatusTrack({ therapist, status, listed = true, onChosen, onRemoved }: Props) {
  const store = useShortlistStore();
  const root = useRef<HTMLDivElement>(null);
  // What takes focus once the track redraws, where what had it has gone or a click never gave it.
  const refocus = useRef<Refocus | undefined>(undefined);
  useLayoutEffect(() => {
    const target = refocus.current;
    refocus.current = undefined;
    if (target) root.current?.querySelector<HTMLElement>(target)?.focus();
  });
  const drafts = listed && status === "toContact";
  usePreloadDrafter(drafts);
  // Open while the visitor writes; mounted only then, as it reads the therapist's profile.
  const [drafting, setDrafting] = useState(false);
  // Shut once the track stops offering it, as when another tab marks them contacted, so it stays shut if they come back.
  if (drafting && !drafts) setDrafting(false);
  // Once the status changes here, the words saying it fade in as they change; as the track first draws they are simply there.
  const [shown, setShown] = useState({ status, changed: false });
  if (status !== shown.status) setShown({ status, changed: true });
  const fadeIn = shown.changed && "fade-in-0 motion-safe:animate-in motion-safe:duration-200 motion-safe:ease-in-out";
  // "Waiting list" pauses at "Contacted"; "Set aside" stands at no step.
  const current = STEPS.indexOf(status === "waiting" ? "contacted" : status);
  const next = NEXT_STEP[status];

  function step(to: Status) {
    // The button goes at the path's end, so focus moves to the menu beside it.
    if (NEXT_STEP[to] === undefined) refocus.current = "[data-status-menu]";
    store.setStatus(therapist.slug, to);
    onChosen?.(to);
  }

  return (
    // A container for the status menu, which names itself on a touch screen only where the row has the room.
    <div ref={root} className="@container/status-track space-y-1.5">
      {/* The role is explicit because Safari drops a list's role, and with it its name, once Tailwind's preflight removes its markers.
          Its dots keep their fill on paper, which a printer would otherwise leave out. */}
      <ol role="list" aria-label={`Steps with ${therapist.name}`} className="flex items-center px-1 print:[print-color-adjust:exact]">
        {STEPS.map((s, i) => (
          <li key={s} aria-current={i === current ? "step" : undefined} className="flex flex-1 items-center last:flex-none">
            <span className="sr-only">{STATUS_LABEL[s]}</span>
            {status === "waiting" && i === current ? (
              <Pause aria-hidden className={cn("size-3 fill-current text-primary", fadeIn && "zoom-in-50", fadeIn)} />
            ) : (
              <span
                aria-hidden
                className={cn(
                  "size-2.5 rounded-full border-[1.5px] motion-safe:transition-colors motion-safe:duration-200",
                  i <= current ? cn(TAKEN, "border-primary") : "border-control",
                )}
              />
            )}
            {i < STEPS.length - 1 && (
              <span aria-hidden className={cn("mx-1 h-0.5 flex-1 overflow-hidden rounded-full", AHEAD)}>
                {/* Filled from the left as the path reaches the next step, and drained back as it leaves it. */}
                <span
                  className={cn(
                    "block h-full origin-left motion-safe:transition-[scale] motion-safe:duration-200",
                    TAKEN,
                    i < current ? "scale-x-100" : "scale-x-0",
                  )}
                />
              </span>
            )}
          </li>
        ))}
      </ol>
      {/* Where the row lacks the room the buttons go under the status, to its right, and under each other; on a touch screen far
          enough apart that no one's target takes another's taps. */}
      <div className="flex min-h-7 flex-wrap items-center justify-between gap-2">
        <p key={status} className={cn("text-sm text-muted-foreground", fadeIn)}>
          {STATUS_LABEL[status]}
        </p>
        {listed ? (
          <div className="ml-auto flex flex-wrap items-center justify-end gap-1 pointer-coarse:gap-y-4">
            {drafts && (
              <Button variant="outline" size="sm" data-draft-email onClick={() => setDrafting(true)}>
                <Mail aria-hidden />
                {/* The space outside, as a name computed from the content may trim it from the start of the hidden words. */}
                Draft an email{" "}
                <span className="sr-only">
                  to <span translate="no">{therapist.name}</span>
                </span>
              </Button>
            )}
            {next && (
              <Button variant="outline" size="sm" data-next-step onClick={() => step(next.status)}>
                {/* Its words drawn anew, the button kept, so focus stays on it. */}
                <span key={next.label} className={cn(fadeIn)}>
                  {next.label}
                </span>
                {/* Each card has one, so the name tells them apart. */}
                <span className="sr-only">
                  , <span translate="no">{therapist.name}</span>
                </span>
              </Button>
            )}
            <StatusMenu therapist={therapist} onChosen={onChosen} onRemoved={onRemoved} />
          </div>
        ) : (
          <p className="ml-auto text-sm text-muted-foreground">Removed from your shortlist</p>
        )}
      </div>
      {drafting && (
        <LazyEmailDrafter
          therapist={therapist}
          onClose={() => {
            setDrafting(false);
            // Back to its button, which a click doesn't focus in Safari or Firefox.
            refocus.current = "[data-draft-email]";
          }}
          onMarked={() => {
            setDrafting(false);
            // Its button goes with the status, so focus moves to the next step instead.
            refocus.current = "[data-next-step]";
            step("contacted");
          }}
        />
      )}
    </div>
  );
}
