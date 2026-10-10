import { Banknote, MapPin, NotebookPen, type LucideIcon } from "lucide-react";
import type { ComponentProps, ReactNode } from "react";
import { Link } from "react-router";
import { classifyLocation } from "@shared/location";
import { ukcpProfileAddress } from "@shared/query";
import type { TherapistCard as Therapist } from "@shared/types";
import { Portrait } from "@/components/Portrait";
import { Sessions } from "@/components/Sessions";
import { SkeletonText } from "@/components/SkeletonText";
import { Badge, TAG } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { useProfileLink } from "@/profile/profileLink";
import { PASSED_ICON, PASSED_LABEL, STATUS_ICON, STATUS_LABEL } from "@/shortlist/status";
import type { Status } from "@/shortlist/store";
import type { Fee } from "./fee";

type Props = {
  therapist: Therapist;
  /** The search's terms, lower-cased; only tags among them are shown. */
  sought: ReadonlySet<string>;
  /** In a pin's box, whose heading names the place: the name drops to an h3 and the card gives only the distance. */
  grouped?: boolean;
  /** The name's heading level, where it differs from `grouped`'s: h3 under a heading of the list's own. */
  heading?: "h2" | "h3";
  /** Among therapists met online or by phone: the card says nothing of where they are, nor of meeting in person unless that is all they offer. */
  online?: boolean;
  /** A control beside the name, such as the shortlist's bookmark. */
  action?: ReactNode;
  /** A row across the card above the summary, such as the shortlist's track of where the visitor stands. */
  track?: ReactNode;
  /** The visitor's note on a shortlisted therapist, whose first line shows under the track. */
  note?: string;
  /** The fees at the office the card names, or that it gives none, once the therapist's profile has been read. */
  fee?: Fee;
  /** Where the visitor stands with a shortlisted therapist; "To contact" goes unsaid, the filled bookmark saying as much. */
  status?: Status;
  /** Passed over by the visitor, which the card says where a status would go, fading the portrait as "Set aside" does. */
  passed?: boolean;
  /** Fades the portrait as "Set aside" does, for a therapist taken off the shortlist whose card stays to add them back. */
  faded?: boolean;
  /** Leaves out the summary, for the shortlist's cards, which hold where the visitor stands in its place. */
  brief?: boolean;
  onHighlight?: (on: boolean) => void;
};

export function TherapistCard({ therapist: t, sought, grouped = false, online = false, heading, action, track, note, fee, status, passed, faded,
  brief, onHighlight }: Props) {
  const profile = useProfileLink();
  const where = grouped || online ? undefined : placeOf(t);
  // UKCP's "0.2 miles from E8 3DQ" repeats the searched place, which the list already names.
  const away = online ? undefined : t.distance?.replace(/\bfrom\b.*$/, "away");
  // The place is left as it is by a browser translating the page, which would read Bath or Reading as words. One span,
  // so the line wraps as one beside its pin, as narrow as the column however long a town's name.
  const place = (where || away) && (
    <span className="min-w-0">
      {where && <span translate="no">{where}</span>}
      {where && away ? ` (${away})` : away}
    </span>
  );
  const meets = online && /remote/i.test(t.sessionTypes ?? "") ? undefined : <Sessions text={t.sessionTypes} />;
  // The first line written; the whole note is on the profile.
  const noteLine = note?.trim().split("\n", 1)[0];

  return (
    <CardLayout
      className="transition-colors hover:bg-muted/40"
      onPointerEnter={() => onHighlight?.(true)}
      onPointerLeave={() => onHighlight?.(false)}
      onFocus={() => onHighlight?.(true)}
      onBlur={() => onHighlight?.(false)}
      heading={heading ?? (grouped ? "h3" : "h2")}
      photo={
        <Portrait photoUrl={t.photoUrl} initials={t.initials} className="size-full" initialsClassName="text-3xl" />
      }
      // The stretched link makes the whole card clickable, as UKCP's is.
      name={
        <Link {...profile(t.slug)} translate="no" className="after:absolute after:inset-0">
          {t.name}
        </Link>
      }
      // Paper can't follow the link, so it gives UKCP's page for them, which outlasts this site's.
      printed={ukcpProfileAddress(t.slug)}
      place={
        place && (
          <span className="flex gap-1.5">
            <MapPin aria-hidden className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
            {place}
          </span>
        )
      }
      meets={meets}
      fee={
        fee && (
          // Boxed apart from the icon, so fees for several kinds of session wrap as one line beside it, as the place does.
          <span className="flex gap-1.5">
            <Banknote aria-hidden className="mt-0.5 size-4 shrink-0" />
            <span className="min-w-0">
              {fee.given && <span className="sr-only">Fees: </span>}
              {fee.text}
            </span>
          </span>
        )
      }
      status={
        passed ? (
          <StatusLine icon={PASSED_ICON} label={PASSED_LABEL} />
        ) : (
          status && status !== "toContact" && <StatusLine icon={STATUS_ICON[status]} label={STATUS_LABEL[status]} />
        )
      }
      // Only the portrait fades: the card stays live wherever it shows, and faded text would fall below AA contrast.
      faded={faded || status === "setAside" || passed}
      action={action}
      track={track}
      note={
        noteLine && (
          <>
            <NotebookPen aria-hidden className="size-4 shrink-0 text-muted-foreground" />
            <span className="sr-only">Your notes: </span>
            {/* Whole on paper, where nothing can show the rest. */}
            <span className="truncate print:whitespace-normal">{noteLine}</span>
          </>
        )
      }
      summary={brief ? undefined : t.summary}
      tags={t.tags.filter((tag) => sought.has(tag.toLowerCase()))}
    />
  );
}

/** A card still loading, laid out as the card is. Among therapists met online there is usually nothing under the name. */
export function TherapistCardSkeleton({ online = false }: { online?: boolean }) {
  return (
    <CardLayout
      aria-hidden
      photo={<Skeleton className="size-full rounded-md" />}
      name={<SkeletonText className="w-3/5" />}
      place={!online && <SkeletonText className="w-2/5" />}
      meets={!online && <SkeletonText className="w-1/3" />}
      summary={<SkeletonText lines={5} className="w-2/3" />}
    />
  );
}

type LayoutProps = ComponentProps<typeof Card> & {
  heading?: "h2" | "h3";
  /** Sized to the photo's place. */
  photo: ReactNode;
  name: ReactNode;
  /** Under the name on paper alone. */
  printed?: string;
  place?: ReactNode;
  meets?: ReactNode;
  fee?: ReactNode;
  status?: ReactNode;
  /** Fades the photo, for a therapist set aside or taken off the shortlist. */
  faded?: boolean;
  action?: ReactNode;
  track?: ReactNode;
  note?: ReactNode;
  summary?: ReactNode;
  tags?: string[];
};

/** The card's layout, which the card and its skeleton share. */
function CardLayout({ heading: Heading = "h2", photo, name, printed, place, meets, fee, status, faded, action, track, note, summary,
  tags = [], className, ...card }: LayoutProps) {
  return (
    // Isolated, so the parts raised over the card's link rise no further than the card, and a list's sticky bar stays above them.
    <Card className={cn("relative isolate", className)} {...card}>
      <CardContent className="@container/therapist space-y-3">
        {/* On a touch screen, where the action is named on screen, and in a card too narrow to keep it beside the name, the
            action goes under the rest beside the photo, the two centred on it together by the rows either side. A card
            without one has no third column, which would take its gap all the same. */}
        <div
          className={cn(
            "grid items-center gap-x-4 stacked:grid-rows-[1fr_auto_auto_1fr]",
            action ? "grid-cols-[auto_minmax(0,1fr)_auto] stacked:grid-cols-[auto_minmax(0,1fr)]" : "grid-cols-[auto_minmax(0,1fr)]",
          )}
        >
          <div className={cn("size-24 transition-[opacity,filter] stacked:row-span-4", faded && "opacity-60 grayscale")}>{photo}</div>
          <div className="min-w-0 space-y-1.5 stacked:col-start-2 stacked:row-start-2">
            {/* Boxed with the name, as hidden on screen it would still count among space-y's children. */}
            <div>
              <Heading className="font-heading text-lg leading-snug font-medium">{name}</Heading>
              {printed && (
                <p translate="no" className="mt-1.5 hidden text-sm wrap-anywhere text-muted-foreground print:block">
                  {printed}
                </p>
              )}
            </div>
            {place && <p className="text-sm">{place}</p>}
            {meets && <p className="text-sm text-muted-foreground">{meets}</p>}
            {fee && <p className="text-sm text-muted-foreground">{fee}</p>}
            {status && <p className="text-sm text-muted-foreground">{status}</p>}
          </div>
          {/* Raised above the stretched link, which would otherwise take its clicks. Under the rest, it reaches as far left as
              the ghost button's padding, so its icon lines up with the name. */}
          {action && (
            <div className="relative z-10 -mt-1 -mr-1 self-start stacked:col-start-2 stacked:row-start-3 stacked:mt-2 stacked:mr-0 stacked:-ml-2.5">
              {action}
            </div>
          )}
        </div>
        {/* Raised as the action is. */}
        {track && <div className="relative z-10">{track}</div>}
        {note && <p className="flex items-center gap-1.5 text-sm">{note}</p>}
        {summary && <p className="text-base">{summary}</p>}
        {tags.length > 0 && (
          <ul className="flex flex-wrap gap-1.5">
            {tags.map((tag) => (
              <li key={tag}>
                <Badge variant="secondary" className={TAG}>
                  {tag}
                </Badge>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

/** Where the visitor stands, by an icon and label. */
function StatusLine({ icon: Icon, label }: { icon: LucideIcon; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <Icon aria-hidden className="size-4 shrink-0" />
      <span className="sr-only">Status: </span>
      {label}
    </span>
  );
}

/** Beside a distance the postcode or district says enough, the town mostly repeating the searched place; with no distance or no code, the location is kept whole. */
function placeOf(t: Therapist): string | undefined {
  if (!t.location || t.distance === undefined) return t.location;
  const text = classifyLocation(t.location);
  if (text.kind === "postcode") return text.postcode;
  if (text.kind === "outcode") return text.outcode;
  return t.location;
}
