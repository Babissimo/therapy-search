import { cn } from "@/lib/utils";

/**
 * Lines of text still to come, each a bar in a line box of the font around it, so the text that takes their place keeps
 * their height. Every line but the last is full, and `className` sizes the last. Spans, so they can stand in a
 * paragraph or heading.
 */
export function SkeletonText({ lines = 1, className }: { lines?: number; className?: string }) {
  return Array.from({ length: lines }, (_, i) => (
    <span key={i} className="block">
      <span className={cn("inline-block h-[0.75em] w-full animate-pulse rounded-md bg-muted align-middle", i === lines - 1 && className)} />
    </span>
  ));
}
