import { Armchair, Video, type LucideIcon } from "lucide-react";
import { UNSAID_SESSIONS } from "@shared/sessions";

// UKCP's two ways of meeting, matched as isRemoteOnly matches them.
const SESSION_ICONS: [RegExp, LucideIcon][] = [
  [/in-person/i, Armchair],
  [/remote/i, Video],
];

/**
 * UKCP's "In-person & Remote" as its kinds side by side, each after its icon; a kind it doesn't know keeps its words alone.
 * Without any, it says so.
 */
export function Sessions({ text }: { text?: string }) {
  if (!text) return <span>{UNSAID_SESSIONS}</span>;
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
