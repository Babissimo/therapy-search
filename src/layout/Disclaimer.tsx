import { cn } from "@/lib/utils";

export function Disclaimer({ className }: { className?: string }) {
  return (
    <p className={cn("text-sm text-muted-foreground", className)}>
      An unofficial front end for the{" "}
      <a className="underline" href="https://www.psychotherapy.org.uk/find-a-therapist/">
        UK Council for Psychotherapy's directory
      </a>
      . Not affiliated with or endorsed by UKCP. Every listing comes from UKCP's site.
    </p>
  );
}
