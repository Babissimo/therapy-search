import { useEffect, useEffectEvent, useId, useState } from "react";
import { Textarea } from "@/components/ui/textarea";
import { NOTE_LIMIT } from "@/shortlist/store";
import { useShortlistNote, useShortlistStore } from "@/shortlist/useShortlist";

/** How long typing rests before the note is saved. */
const SAVE_AFTER = 500;

/** The visitor's own notes on a shortlisted therapist, kept with the shortlist and saved as they type. */
export function NoteField({ slug }: { slug: string }) {
  const store = useShortlistStore();
  const saved = useShortlistNote(slug);
  const [draft, setDraft] = useState(saved);
  // The note as last saved, here or in another tab; a change to it replaces what the box holds.
  const [seen, setSeen] = useState(saved);
  if (saved !== seen) {
    setSeen(saved);
    setDraft(saved);
  }
  const box = useId();
  const hint = useId();

  const flush = () => {
    if (draft !== saved) store.setNote(slug, draft);
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
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={flush}
        className="md:text-base"
      />
      <p id={hint} className="text-sm text-muted-foreground">
        Saved as you type, in this browser only.
      </p>
    </div>
  );
}
