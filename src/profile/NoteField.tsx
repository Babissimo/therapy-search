import { useEffect, useEffectEvent, useId, useState } from "react";
import { Textarea } from "@/components/ui/textarea";
import { SAVE_AFTER } from "@/lib/useSavedValue";
import { NOTE_LIMIT } from "@/shortlist/store";
import { useShortlisted, useShortlistNote, useShortlistStore } from "@/shortlist/useShortlist";

/** How few characters may be left before the box says how many. */
const COUNT_WITHIN = 100;

/** The visitor's own notes on a shortlisted therapist, kept with the shortlist and saved as they type. */
export function NoteField({ slug }: { slug: string }) {
  const store = useShortlistStore();
  const listed = useShortlisted(slug);
  const saved = useShortlistNote(slug);
  const [draft, setDraft] = useState(saved);
  // The note as last saved, here or in another tab; a change to it replaces what the box holds. Off the list the note reads as none,
  // which is no change to take: the box keeps what it holds, and saves against the note it last saw.
  const [seen, setSeen] = useState(saved);
  if (listed && saved !== seen) {
    setSeen(saved);
    setDraft(saved);
  }
  const kept = listed ? saved : seen;
  const box = useId();
  const hint = useId();
  const left = NOTE_LIMIT - draft.length;
  // From the note as saved, which follows the typing once it rests, so a screen reader hears the count at a pause, not at every key.
  const leftSaved = NOTE_LIMIT - kept.length;

  const flush = () => {
    if (draft === kept) return;
    store.setNote(slug, draft);
    // Nothing is read back once off the list, so what was saved is the note last seen.
    if (!listed) setSeen(draft);
  };
  // For the timer and the leaving, which want the draft as last drawn.
  const save = useEffectEvent(flush);
  useEffect(() => {
    const timer = setTimeout(() => save(), SAVE_AFTER);
    return () => clearTimeout(timer);
  }, [draft]);
  // Neither a box removed with focus in it nor a page hidden or closed is blurred in every browser, and a hidden page's timer may
  // never run, so what was typed since the last save is saved as either goes.
  useEffect(() => {
    const leave = () => save();
    document.addEventListener("visibilitychange", leave);
    window.addEventListener("pagehide", leave);
    return () => {
      document.removeEventListener("visibilitychange", leave);
      window.removeEventListener("pagehide", leave);
      save();
    };
  }, []);

  return (
    <div className="grid gap-1.5">
      <label htmlFor={box} className="text-sm font-medium">
        Your notes
      </label>
      <Textarea
        id={box}
        aria-describedby={hint}
        maxLength={NOTE_LIMIT}
        // Enhanced spellcheck in Chrome and Edge sends what is typed to Google or Microsoft.
        spellCheck={false}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={flush}
        // Grows with the note to about seven lines, then scrolls.
        className="max-h-48 md:text-base"
      />
      <p id={hint} className="text-sm text-muted-foreground">
        Saved as you type, in this browser only.{left <= COUNT_WITHIN && ` ${charactersLeft(left)}`}
      </p>
      <p aria-live="polite" className="sr-only">
        {leftSaved <= COUNT_WITHIN && charactersLeft(leftSaved)}
      </p>
    </div>
  );
}

function charactersLeft(count: number): string {
  return `${count} ${count === 1 ? "character" : "characters"} left.`;
}
