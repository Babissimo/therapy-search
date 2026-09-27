import { Badge } from "@/components/ui/badge";

export function TickedCount({ count }: { count: number }) {
  if (count === 0) return null;
  // The comma keeps the count apart from the heading when a screen reader runs their text together.
  return (
    <Badge variant="secondary">
      <span aria-hidden>{count}</span>
      <span className="sr-only">, {count} ticked</span>
    </Badge>
  );
}
