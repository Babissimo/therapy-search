import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";

type Props = {
  photoUrl?: string;
  initials: string;
  /** Sizes the portrait. */
  className?: string;
  /** Sizes the initials to match. */
  initialsClassName?: string;
};

/** A therapist's photo, squared off as a portrait rather than rounded as an account's icon, or their initials on slate. */
export function Portrait({ photoUrl, initials, className, initialsClassName }: Props) {
  return (
    <Avatar className={cn("rounded-md after:rounded-md", className)}>
      <AvatarImage src={photoUrl} alt="" className="rounded-md" />
      {/* Muted while a photo loads, so a slate square doesn't flash up before it. */}
      <AvatarFallback className={cn("rounded-md", !photoUrl && "bg-primary font-heading text-primary-foreground", initialsClassName)}>
        {initials}
      </AvatarFallback>
    </Avatar>
  );
}
