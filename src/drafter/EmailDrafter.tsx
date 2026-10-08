import { useQuery } from "@tanstack/react-query";
import { Loader2, RotateCcw } from "lucide-react";
import { useId, useLayoutEffect, useMemo, useRef, useState, type ComponentProps, type Ref } from "react";
import { InvalidParam, type SearchParams } from "@shared/query";
import { ErrorLine } from "@/components/ErrorLine";
import { FailureStatus, useFailure } from "@/components/FailedAlert";
import { SkeletonText } from "@/components/SkeletonText";
import { Unfold } from "@/components/Unfold";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { HelpNow } from "@/layout/HelpNow";
import { useSavedValue } from "@/lib/useSavedValue";
import { profileQuery } from "@/profile/ProfilePage";
import { readSearch, useShownParams } from "@/search/useSearchState";
import { MESSAGE_LIMIT, SENDER_LIMIT, SUBJECT_LIMIT, type EmailDraft, type Sender, type ShortlistCard } from "@/shortlist/store";
import { useShortlistDraft, useShortlistSearch, useShortlistSender, useShortlistStore } from "@/shortlist/useShortlist";
import { mentionsOf } from "./mentions";
import { asksFee, firstName, writeEmail } from "./message";

type Props = {
  therapist: ShortlistCard;
  onClose: () => void;
  /** After the visitor says they got in touch. */
  onMarked: () => void;
};

/**
 * A first email to a shortlisted therapist, written from the search they were found by and their profile until the visitor
 * edits it, and theirs from then on, saved with the therapist as they type.
 */
export function EmailDrafter({ therapist, onClose }: Props) {
  const { slug } = therapist;
  const store = useShortlistStore();
  const profileAnswer = useQuery(profileQuery(slug));
  // A retried profile that arrives takes Try again away, so the keyboard goes on to the message it rewrites.
  const failure = useFailure<HTMLTextAreaElement>(profileAnswer, slug);
  const messageBox = failure.landing;
  const profile = profileAnswer.data;
  const settled = profile !== undefined || failure.error !== undefined;
  const search = useSearchOf(slug);
  const mentions = useMemo(() => (search ? mentionsOf(search, profile) : []), [search, profile]);
  const [unticked, setUnticked] = useState<ReadonlySet<string>>(() => new Set());
  const sender = useSavedValue(useShortlistSender(), store.setSender);
  const written = writeEmail({ therapist: therapist.name, mentions, unticked, asksFee: asksFee(profile), sender: sender.value });
  const draft = useSavedValue(useShortlistDraft(slug), (value) => store.setDraft(slug, value));
  // The site writes the draft until the visitor edits it.
  const writing = draft.value === undefined;
  const shown = draft.value ?? written;
  // Keys in the order the store gives them back, so a saved value reads as no change.
  const editDraft = (change: Partial<EmailDraft>) => draft.set({ subject: shown.subject, message: shown.message, ...change });
  const editSender = (change: Sender) => sender.set({ name: sender.value.name, free: sender.value.free, ...change });
  const first = firstName(therapist.name);
  const fromSearch = mentions.length > 0;

  // What opened it, where the keyboard goes back to: Radix would send it to the dialog's trigger, and it has none.
  const [opener] = useState(() => document.activeElement);
  const fold = useRef<HTMLDivElement>(null);
  // While the site writes the draft, the keyboard starts on the first chip, or on the first field where there are none.
  const toStart = () => focusOnceShown(fold.current?.querySelector<HTMLElement>("[role=checkbox], input"));
  // Set as Start again takes the visitor's text away, and its own button with it.
  const restarted = useRef(false);
  useLayoutEffect(() => {
    if (!restarted.current) return;
    restarted.current = false;
    toStart();
  });

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        // Off paper, which can't send it.
        className="print:hidden"
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          if (writing) toStart();
          else messageBox.current?.focus();
        }}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          // Unless the page beneath took the keyboard as the drafter went.
          const now = document.activeElement;
          if ((now === null || now === document.body) && opener instanceof HTMLElement) opener.focus();
        }}
      >
        <DialogHeader>
          <DialogTitle>Draft an email to {first}</DialogTitle>
        </DialogHeader>
        <DialogDescription>
          {writing && fromSearch
            ? "Written from your search. Untick anything you'd rather leave out, and change anything before you send it."
            : "Change anything before you send it."}
        </DialogDescription>
        {/* What failed, which the error's own message doesn't say. Not the shown line's clause on the search, which goes as the
            visitor edits, and would be said again as it went. */}
        <FailureStatus failure={failure} saying={`${first}'s profile couldn't be read.`} />
        <div className="space-y-4">
          {/* Its gap below is inside what folds, as space-y-4's would stay while it is folded. Wider than the column by a
              focus ring either side, which the fold's clipping would otherwise cut. */}
          <Unfold open={writing} className="-mx-1 mb-0">
            <div ref={fold} className="space-y-4 px-1 pb-4">
              {fromSearch && (
                <fieldset>
                  <legend className="mb-2 text-sm font-medium">Mention</legend>
                  <ul role="list" className="flex flex-wrap gap-2">
                    {mentions.map((mention) => (
                      <Chip
                        key={mention.key}
                        label={mention.label}
                        ticked={!unticked.has(mention.key)}
                        onTicked={(ticked) => setUnticked((keys) => including(keys, mention.key, !ticked))}
                      />
                    ))}
                  </ul>
                </fieldset>
              )}
              <div className="grid gap-4 sm:grid-cols-2">
                <Field
                  label="When are you usually free?"
                  placeholder="weekday evenings"
                  maxLength={SENDER_LIMIT}
                  value={sender.value.free ?? ""}
                  onValue={(free) => editSender({ free })}
                />
                <Field
                  label="Your name"
                  autoComplete="name"
                  maxLength={SENDER_LIMIT}
                  value={sender.value.name ?? ""}
                  onValue={(name) => editSender({ name })}
                />
              </div>
            </div>
          </Unfold>
          {!writing && (
            <StartAgain
              fromSearch={fromSearch}
              onConfirm={() => {
                restarted.current = true;
                // Every mention ticked again, as on opening.
                setUnticked(new Set());
                draft.saveNow(undefined);
              }}
            />
          )}
          {settled || !writing ? (
            <>
              <Field label="Subject" maxLength={SUBJECT_LIMIT} value={shown.subject} onValue={(subject) => editDraft({ subject })} />
              <MessageField ref={messageBox} value={shown.message} onValue={(message) => editDraft({ message })} />
            </>
          ) : (
            <div aria-busy className="space-y-3">
              <SkeletonText className="w-40" />
              <SkeletonText lines={8} className="w-2/3" />
              <span className="sr-only">Writing your draft</span>
            </div>
          )}
          {failure.error && (
            <ErrorLine quiet>
              {first}'s profile couldn't be read{writing && fromSearch && ", so this is written from your search alone"}.{" "}
              <Button
                variant="link"
                size="sm"
                className="h-auto p-0 aria-disabled:opacity-50"
                // Not disabled while retrying, which would drop focus; a second press is ignored.
                aria-disabled={failure.retrying}
                onClick={failure.retrying ? undefined : failure.retry}
              >
                {failure.retrying && <Loader2 className="motion-safe:animate-spin" aria-hidden />}
                Try again
              </Button>
            </ErrorLine>
          )}
          {written.crisis && <HelpNow className="text-sm" />}
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** The search a therapist was shortlisted from, else the one on screen; none where neither is, or the kept one no longer reads. */
function useSearchOf(slug: string): SearchParams | undefined {
  const kept = useShortlistSearch(slug);
  const shown = useShownParams();
  const read = useMemo(() => {
    if (kept === undefined) return undefined;
    try {
      return readSearch(kept);
    } catch (error) {
      if (error instanceof InvalidParam) return undefined;
      throw error;
    }
  }, [kept]);
  return kept === undefined ? shown : read;
}

/**
 * How many frames to keep trying to focus what a fold unfolds. Frames rather than time, as it shows once the fold draws, and
 * a busy browser may draw only two in the fold's 200 ms.
 */
const SHOWN_WITHIN_FRAMES = 60;

/**
 * Focuses `element` once it can take focus. What a fold unfolds stays hidden, and refuses focus, until the fold's first
 * frame, so it is tried again each frame until it holds focus or `SHOWN_WITHIN_FRAMES` frames have passed. A try again
 * takes the keyboard only from the page or the dialog itself, where Radix leaves it, never from a control the visitor moved to.
 */
function focusOnceShown(element: HTMLElement | null | undefined) {
  const dialog = element?.closest("[role=dialog]");
  let frames = SHOWN_WITHIN_FRAMES;
  const attempt = () => {
    if (!element?.isConnected) return;
    // Without scrolling, which would scroll the opening fold's clipping box to it, sliding what it holds into place.
    element.focus({ preventScroll: true });
    if (document.activeElement === element || frames-- === 0) return;
    requestAnimationFrame(() => {
      const now = document.activeElement;
      if (now === null || now === document.body || now === dialog) attempt();
    });
  };
  attempt();
}

/** `keys` with `key` among them or not. */
function including(keys: ReadonlySet<string>, key: string, included: boolean): ReadonlySet<string> {
  const next = new Set(keys);
  if (included) next.add(key);
  else next.delete(key);
  return next;
}

/** A mention as a chip: a checkbox, ticked by a check as well as by its fill, so forced colours show it too. */
function Chip({ label, ticked, onTicked }: { label: string; ticked: boolean; onTicked: (ticked: boolean) => void }) {
  const id = useId();
  return (
    <li>
      <label
        htmlFor={id}
        className="flex min-h-8 cursor-pointer items-center gap-2 rounded-full border px-3 text-sm has-data-checked:border-primary has-data-checked:bg-primary/10 pointer-coarse:min-h-11"
      >
        <Checkbox id={id} checked={ticked} onCheckedChange={(checked) => onTicked(checked === true)} />
        {label}
      </label>
    </li>
  );
}

type FieldProps = { label: string; value: string; onValue: (value: string) => void } & Omit<ComponentProps<typeof Input>, "value" | "onChange">;

function Field({ label, value, onValue, ...props }: FieldProps) {
  const id = useId();
  return (
    <div className="grid gap-1.5">
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      {/* Enhanced spellcheck in Chrome and Edge sends what is typed to Google or Microsoft. */}
      <Input id={id} value={value} onChange={(event) => onValue(event.target.value)} spellCheck={false} className="md:text-base" {...props} />
    </div>
  );
}

function MessageField({ ref, value, onValue }: { ref: Ref<HTMLTextAreaElement>; value: string; onValue: (value: string) => void }) {
  const id = useId();
  const hint = useId();
  return (
    <div className="grid gap-1.5">
      <label htmlFor={id} className="text-sm font-medium">
        Message
      </label>
      <Textarea
        ref={ref}
        id={id}
        aria-describedby={hint}
        maxLength={MESSAGE_LIMIT}
        // Enhanced spellcheck in Chrome and Edge sends what is typed to Google or Microsoft.
        spellCheck={false}
        value={value}
        onChange={(event) => onValue(event.target.value)}
        // Ten lines where the browser can't size it to the text; where it can, it grows to half the screen, then scrolls.
        rows={10}
        className="max-h-[50svh] md:text-base"
      />
      <p id={hint} className="text-sm text-muted-foreground">
        Saved as you type, in this browser only.
      </p>
    </div>
  );
}

/** Puts back the site's draft in place of the visitor's, once they confirm, as their edits can't be got back. */
function StartAgain({ fromSearch, onConfirm }: { fromSearch: boolean; onConfirm: () => void }) {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="link" size="sm" className="h-auto p-0">
          <RotateCcw aria-hidden />
          {fromSearch ? "Start again from your search" : "Start again"}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="text-lg">Start again?</AlertDialogTitle>
          <AlertDialogDescription className="text-base">
            This replaces your subject and message with a fresh draft. Your changes can't be got back.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Keep my changes</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm}>Start again</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
