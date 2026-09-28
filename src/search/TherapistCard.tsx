import { MapPinOff } from "lucide-react";
import { Link } from "react-router";
import type { TherapistCard as Therapist } from "@shared/types";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";

export function TherapistCard({ therapist: t, note, onHighlight }: { therapist: Therapist; note?: string; onHighlight?: (on: boolean) => void }) {
  const place = [t.location, t.distance && `(${t.distance})`].filter(Boolean).join(" ");
  const contact = [t.phone, t.sessionTypes].filter(Boolean).join(" | ");

  return (
    <Card
      className="relative transition-colors hover:bg-muted/40"
      onPointerEnter={() => onHighlight?.(true)}
      onPointerLeave={() => onHighlight?.(false)}
      onFocus={() => onHighlight?.(true)}
      onBlur={() => onHighlight?.(false)}
    >
      <CardContent className="flex gap-4">
        <Avatar className="size-16 shrink-0">
          <AvatarImage src={t.photoUrl} alt="" />
          <AvatarFallback>{t.initials}</AvatarFallback>
        </Avatar>
        <div className="min-w-0 space-y-1.5">
          <h2 className="font-semibold">
            {/* The stretched link makes the whole card clickable, as UKCP's is. */}
            <Link to={`/therapist/${t.slug}`} className="after:absolute after:inset-0">
              {t.name}
            </Link>
          </h2>
          {place && <p className="text-sm">{place}</p>}
          {note && (
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <MapPinOff aria-hidden className="size-3.5 shrink-0" />
              <span className="sr-only">Not on the map: </span>
              {note}
            </p>
          )}
          {contact && <p className="text-sm text-muted-foreground">{contact}</p>}
          {t.summary && <p className="text-sm">{t.summary}</p>}
          {t.tags.length > 0 && (
            <ul className="flex flex-wrap gap-1.5">
              {t.tags.map((tag) => (
                <li key={tag}>
                  <Badge variant="secondary">{tag}</Badge>
                </li>
              ))}
            </ul>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
