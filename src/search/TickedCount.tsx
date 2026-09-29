import { Badge } from "@/components/ui/badge";

export function TickedCount({ count, className }: { count: number; className?: string }) {
  if (count === 0) return null;
  // The comma keeps the count apart from the heading when a screen reader runs their text together.
  return (
    <Badge variant="secondary" className={className}>
      <span aria-hidden>{count}</span>
      <span className="sr-only">, {count} ticked</span>
    </Badge>
  );
}
