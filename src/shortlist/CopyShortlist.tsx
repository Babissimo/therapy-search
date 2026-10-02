import { useEffect, useState, type MouseEvent } from "react";
import { Button } from "@/components/ui/button";
import { copyText } from "@/lib/clipboard";
import { cn } from "@/lib/utils";
import { shortlistText } from "./asText";
import type { Shortlist } from "./store";
import { therapistCount } from "./useShortlist";

type Props = {
  shortlist: Shortlist;
  /** Says how the copy went, to be announced; an empty message first, so a second copy is heard as the first was. */
  onDone: (message: string) => void;
};

const FAILED = "Your shortlist couldn't be copied in this browser. You could print it instead.";

/** Copies the shortlist as plain text, to take away from a browser someone else may use next; the button says for a moment whether it went. */
export function CopyShortlist({ shortlist, onDone }: Props) {
  // A new object each copy, so a second copy soon after the first says so for as long.
  const [result, setResult] = useState<{ said: "copied" | "failed" }>();
  useEffect(() => {
    if (!result) return;
    const timer = setTimeout(() => setResult(undefined), 3000);
    return () => clearTimeout(timer);
  }, [result]);

  async function copy(event: MouseEvent<HTMLButtonElement>) {
    onDone("");
    const copied = await copyText(shortlistText(shortlist, new Date()), event.currentTarget.parentElement ?? document.body);
    setResult({ said: copied ? "copied" : "failed" });
    onDone(copied ? `Copied ${therapistCount(shortlist.length)} as text, ready to paste.` : FAILED);
  }

  const shown = result?.said ?? "ready";
  return (
    <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={copy}>
      {/* Every label holds its place, so the button keeps one width, and the header its lines, as they change. */}
      <span className="grid">
        {LABELS.map(([key, label]) => (
          <span key={key} aria-hidden={key !== shown || undefined} className={cn("col-start-1 row-start-1", key !== shown && "invisible")}>
            {label}
          </span>
        ))}
      </span>
    </Button>
  );
}

const LABELS = [
  ["ready", "Copy as text"],
  ["copied", "Copied"],
  ["failed", "Couldn't copy"],
] as const;
