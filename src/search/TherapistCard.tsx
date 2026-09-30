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

type Props = {
  therapist: Therapist;
  /** The search's terms, lower-cased; only tags among them are shown. */
  sought: ReadonlySet<string>;
  /** In a pin's box, whose heading names the place: the name drops to an h3 and the card gives only the distance. */
  grouped?: boolean;
  /** Among therapists met online or by phone: the card says nothing of where they are, nor of meeting in person unless that is all they offer. */
  online?: boolean;
  /** A control beside the name, such as the shortlist's bookmark. */
  action?: ReactNode;
  onHighlight?: (on: boolean) => void;
};

export function TherapistCard({ therapist: t, sought, grouped = false, online = false, action, onHighlight }: Props) {
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
      heading={grouped ? "h3" : "h2"}
      photo={
        <Portrait photoUrl={t.photoUrl} initials={t.initials} className="size-full" initialsClassName="text-3xl" />
      }
      // The stretched link makes the whole card clickable, as UKCP's is.
      name={
        <Link {...profile(t.slug)} className="after:absolute after:inset-0">
          {t.name}
        </Link>
      }
      place={place}
      meets={meets}
      action={action}
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
  action?: ReactNode;
  summary?: ReactNode;
  tags?: string[];
};

/** The card's layout, which the card and its skeleton share. */
function CardLayout({ heading: Heading = "h2", photo, name, place, meets, action, summary, tags = [], className, ...card }: LayoutProps) {
  return (
    <Card className={cn("relative", className)} {...card}>
      <CardContent className="space-y-3">
        <div className="flex items-center gap-4">
          <div className="size-24 shrink-0">{photo}</div>
          <div className="min-w-0 flex-1 space-y-1.5">
            <Heading className="font-heading text-lg leading-snug font-medium">{name}</Heading>
            {place && <p className="text-sm">{place}</p>}
            {meets && <p className="text-sm text-muted-foreground">{meets}</p>}
          </div>
          {/* Raised above the stretched link, which would otherwise take its clicks. */}
          {action && <div className="relative z-10 -mt-1 -mr-1 self-start">{action}</div>}
        </div>
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

/** Beside a distance the postcode or district says enough, the town mostly repeating the searched place; with no distance or no code, the location is kept whole. */
function placeOf(t: Therapist): string | undefined {
  if (!t.location || t.distance === undefined) return t.location;
  const text = classifyLocation(t.location);
  if (text.kind === "postcode") return text.postcode;
  if (text.kind === "outcode") return text.outcode;
  return t.location;
}
