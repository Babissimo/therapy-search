import { MapPinOff } from "lucide-react";
import { Link } from "react-router";
import { classifyLocation } from "@shared/location";
import type { TherapistCard as Therapist } from "@shared/types";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { useProfileLink } from "@/profile/profileLink";

type Props = {
  therapist: Therapist;
  /** The search's terms, lower-cased; only tags among them are shown. */
  sought: ReadonlySet<string>;
  note?: string;
  /** In a pin's box, whose heading names the place: the name drops to an h3 and the card gives only the distance. */
  grouped?: boolean;
  onHighlight?: (on: boolean) => void;
};

export function TherapistCard({ therapist: t, sought, note, grouped = false, onHighlight }: Props) {
  const profile = useProfileLink();
  const Heading = grouped ? "h3" : "h2";
  const where = grouped ? undefined : placeOf(t);
  // UKCP's "0.2 miles from E8 3DQ" repeats the searched place, which the list already names.
  const away = t.distance?.replace(/\bfrom\b.*$/, "away");
  const place = where && away ? `${where} (${away})` : (where ?? away);
  const tags = t.tags.filter((tag) => sought.has(tag.toLowerCase()));

  return (
    <Card
      className="relative transition-colors hover:bg-muted/40"
      onPointerEnter={() => onHighlight?.(true)}
      onPointerLeave={() => onHighlight?.(false)}
      onFocus={() => onHighlight?.(true)}
      onBlur={() => onHighlight?.(false)}
    >
      <CardContent className="space-y-3">
        <div className="flex items-center gap-4">
          <Avatar className="size-24 shrink-0">
            <AvatarImage src={t.photoUrl} alt="" />
            <AvatarFallback className="text-xl">{t.initials}</AvatarFallback>
          </Avatar>
          <div className="min-w-0 space-y-1.5">
            <Heading className="font-semibold">
              {/* The stretched link makes the whole card clickable, as UKCP's is. */}
              <Link {...profile(t.slug)} className="after:absolute after:inset-0">
                {t.name}
              </Link>
            </Heading>
            {place && <p className="text-sm">{place}</p>}
            {note && (
              <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <MapPinOff aria-hidden className="size-3.5 shrink-0" />
                <span className="sr-only">Not on the map: </span>
                {note}
              </p>
            )}
            {t.sessionTypes && <p className="text-sm text-muted-foreground">{t.sessionTypes}</p>}
          </div>
        </div>
        {t.summary && <p className="text-sm">{t.summary}</p>}
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
