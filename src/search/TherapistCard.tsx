import { Armchair, Banknote, MapPin, Video, type LucideIcon } from "lucide-react";
import type { ComponentProps, ReactNode } from "react";
import { Link } from "react-router";
import { classifyLocation } from "@shared/location";
import type { TherapistCard as Therapist } from "@shared/types";
import { Portrait } from "@/components/Portrait";
import { SkeletonText } from "@/components/SkeletonText";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { useProfileLink } from "@/profile/profileLink";
import { STATUS_ICON, STATUS_LABEL } from "@/shortlist/status";
import type { Status } from "@/shortlist/store";

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
  /** The fee at the office the card names, once the therapist's profile has been read. */
  fee?: string;
  /** Where the visitor stands with a shortlisted therapist; "To contact" goes unsaid, the filled bookmark saying as much. */
  status?: Status;
  /** Fades the portrait as "Set aside" does, for a therapist taken off the shortlist whose card stays to add them back. */
  faded?: boolean;
  onHighlight?: (on: boolean) => void;
};

export function TherapistCard({ therapist: t, sought, grouped = false, online = false, heading, action, track, fee, status, faded,
  onHighlight }: Props) {
  const profile = useProfileLink();
  const where = grouped || online ? undefined : placeOf(t);
  // UKCP's "0.2 miles from E8 3DQ" repeats the searched place, which the list already names.
  const away = online ? undefined : t.distance?.replace(/\bfrom\b.*$/, "away");
  const place = where && away ? `${where} (${away})` : (where ?? away);
  const meets = online && /remote/i.test(t.sessionTypes ?? "") ? undefined : t.sessionTypes;

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
        <Link {...profile(t.slug)} className="after:absolute after:inset-0">
          {t.name}
        </Link>
      }
      place={
        place && (
          <span className="flex gap-1.5">
            <MapPin aria-hidden className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
            {place}
          </span>
        )
      }
      meets={meets && <Sessions text={meets} />}
      fee={
        fee && (
          <span className="flex items-center gap-1.5">
            <Banknote aria-hidden className="size-4 shrink-0" />
            <span className="sr-only">Fees: </span>
            {fee}
          </span>
        )
      }
      status={status && status !== "toContact" && <StatusLine status={status} />}
      // Only the portrait fades: the card stays live wherever it shows, and faded text would fall below AA contrast.
      faded={faded || status === "setAside"}
      action={action}
      track={track}
      summary={t.summary}
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
  place?: ReactNode;
  meets?: ReactNode;
  fee?: ReactNode;
  status?: ReactNode;
  /** Fades the photo, for a therapist set aside or taken off the shortlist. */
  faded?: boolean;
  action?: ReactNode;
  track?: ReactNode;
  summary?: ReactNode;
  tags?: string[];
};

/** The card's layout, which the card and its skeleton share. */
function CardLayout({ heading: Heading = "h2", photo, name, place, meets, fee, status, faded, action, track, summary, tags = [],
  className, ...card }: LayoutProps) {
  return (
    // Isolated, so the parts raised over the card's link rise no further than the card, and a list's sticky bar stays above them.
    <Card className={cn("relative isolate", className)} {...card}>
      <CardContent className="space-y-3">
        <div className="flex items-center gap-4">
          <div className={cn("size-24 shrink-0 transition-[opacity,filter]", faded && "opacity-60 grayscale")}>{photo}</div>
          <div className="min-w-0 flex-1 space-y-1.5">
            <Heading className="font-heading text-lg leading-snug font-medium">{name}</Heading>
            {place && <p className="text-sm">{place}</p>}
            {meets && <p className="text-sm text-muted-foreground">{meets}</p>}
            {fee && <p className="text-sm text-muted-foreground">{fee}</p>}
            {status && <p className="text-sm text-muted-foreground">{status}</p>}
          </div>
          {/* Raised above the stretched link, which would otherwise take its clicks. */}
          {action && <div className="relative z-10 -mt-1 -mr-1 self-start">{action}</div>}
        </div>
        {/* Raised as the action is. */}
        {track && <div className="relative z-10">{track}</div>}
        {summary && <p className="text-base">{summary}</p>}
        {tags.length > 0 && (
          <ul className="flex flex-wrap gap-1.5">
            {tags.map((tag) => (
              <li key={tag}>
                <Badge variant="secondary">{tag}</Badge>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

// UKCP's two ways of meeting, matched as isRemoteOnly matches them.
const SESSION_ICONS: [RegExp, LucideIcon][] = [
  [/in-person/i, Armchair],
  [/remote/i, Video],
];

/** UKCP's "In-person & Remote" as its kinds side by side, each after its icon; a kind it doesn't know keeps its words alone. */
function Sessions({ text }: { text: string }) {
  const kinds = text.split(/\s*&\s*/).filter(Boolean);
  return (
    <span className="flex flex-wrap gap-x-3 gap-y-1">
      {kinds.map((kind, i) => {
        const Icon = SESSION_ICONS.find(([pattern]) => pattern.test(kind))?.[1];
        return (
          <span key={i} className="inline-flex items-center gap-1.5">
            {/* Parts the kinds for a screen reader, which would otherwise run them together. */}
            {i > 0 && <span className="sr-only">, </span>}
            {Icon && <Icon aria-hidden className="size-4 shrink-0" />}
            {kind}
          </span>
        );
      })}
    </span>
  );
}

/** A status by its icon and label, as the status menu gives it. */
function StatusLine({ status }: { status: Status }) {
  const Icon = STATUS_ICON[status];
  return (
    <span className="flex items-center gap-1.5">
      <Icon aria-hidden className="size-4 shrink-0" />
      <span className="sr-only">Status: </span>
      {STATUS_LABEL[status]}
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
