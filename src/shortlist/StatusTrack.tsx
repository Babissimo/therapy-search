import { Pause } from "lucide-react";
import { useLayoutEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
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
  // Set when the button takes them to the path's end, where it goes, so focus moves to the menu beside it.
  const toMenu = useRef(false);
  useLayoutEffect(() => {
    if (!toMenu.current) return;
    toMenu.current = false;
    root.current?.querySelector<HTMLElement>("[data-status-menu]")?.focus();
  });
  // "Waiting list" pauses at "Contacted"; "Set aside" stands at no step.
  const current = STEPS.indexOf(status === "waiting" ? "contacted" : status);
  const next = NEXT_STEP[status];

  function step(to: Status) {
    toMenu.current = NEXT_STEP[to] === undefined;
    store.setStatus(therapist.slug, to);
    onChosen?.(to);
  }

  return (
    <div ref={root} className="space-y-1.5">
      {/* The role is explicit because Safari drops a list's role, and with it its name, once Tailwind's preflight removes its markers.
          Its dots keep their fill on paper, which a printer would otherwise leave out. */}
      <ol role="list" aria-label={`Steps with ${therapist.name}`} className="flex items-center px-1 print:[print-color-adjust:exact]">
        {STEPS.map((s, i) => (
          <li key={s} aria-current={i === current ? "step" : undefined} className="flex flex-1 items-center last:flex-none">
            <span className="sr-only">{STATUS_LABEL[s]}</span>
            {status === "waiting" && i === current ? (
              <Pause aria-hidden className="size-3 fill-current text-primary" />
            ) : (
              <span aria-hidden className={cn("size-2.5 rounded-full", i <= current ? TAKEN : "border-[1.5px] border-control")} />
            )}
            {i < STEPS.length - 1 && <span aria-hidden className={cn("mx-1 h-0.5 flex-1 rounded-full", i < current ? TAKEN : AHEAD)} />}
          </li>
        ))}
      </ol>
      <div className="flex min-h-7 items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">{STATUS_LABEL[status]}</p>
        {listed ? (
          <div className="flex items-center gap-1 pointer-coarse:gap-2">
            {next && (
              <Button variant="outline" size="sm" onClick={() => step(next.status)}>
                {next.label}
                {/* Each card has one, so the name tells them apart. */}
                <span className="sr-only">
                  , <span translate="no">{therapist.name}</span>
                </span>
              </Button>
            )}
            <StatusMenu therapist={therapist} onChosen={onChosen} onRemoved={onRemoved} />
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Removed from your shortlist</p>
        )}
      </div>
    </div>
  );
}
