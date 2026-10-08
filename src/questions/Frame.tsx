import { useEffect, useId, useRef, type ReactNode } from "react";
import { BackButton } from "@/components/BackButton";
import { Button } from "@/components/ui/button";
import { useTitle } from "@/lib/useTitle";

/** An answer's box, which shows when it is chosen and when the keyboard is on it. */
export const TILE =
  "flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border border-border px-4 py-3 text-base has-[:checked]:border-primary " +
  "has-[:checked]:bg-primary/5 has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-ring/50";
/** A radio or checkbox, in the site's colour. */
export const MARK = "size-4 shrink-0 accent-primary";

/**
 * A screen's heading, which names the page and takes the keyboard as the screen opens, so it is read out as the last
 * screen's controls go. The page draws each screen afresh, so this runs once a screen.
 */
export function ScreenHeading({ children }: { children: string }) {
  useTitle(children);
  const ref = useRef<HTMLHeadingElement>(null);
  useEffect(() => ref.current?.focus(), []);
  return (
    <h1 ref={ref} tabIndex={-1} className="font-heading text-3xl font-medium outline-none">
      {children}
    </h1>
  );
}

type FrameProps = {
  heading: string;
  /** Where the question falls, as "Question 2 of 8". */
  count: string;
  hint?: ReactNode;
  children: ReactNode;
  onNext: () => void;
};

/**
 * A question: its answers in a group named by its heading and described by its hint, with the way back and Next, which
 * Enter in a box presses too.
 */
export function QuestionFrame({ heading, count, hint, children, onNext }: FrameProps) {
  const hintId = useId();
  return (
    <div className="max-w-reading space-y-8">
      {/* Outside the form, as the site's Button sets no type: inside it, Back would submit the form and be what Enter presses. */}
      <BackButton label="Back" />
      <form
        className="space-y-8"
        onSubmit={(e) => {
          e.preventDefault();
          onNext();
        }}
      >
        <fieldset className="space-y-6" aria-describedby={hint ? hintId : undefined}>
          <legend className="space-y-2">
            <span className="block text-muted-foreground">{count}</span>
            <ScreenHeading>{heading}</ScreenHeading>
          </legend>
          {hint && <p id={hintId} className="text-muted-foreground">{hint}</p>}
          {children}
        </fieldset>
        <Button type="submit" className="h-11 px-5 text-base">
          Next
        </Button>
      </form>
    </div>
  );
}

type ChoicesProps<T extends string> = {
  name: string;
  choices: readonly { value: T; label: string }[];
  value: T | undefined;
  onChange: (value: T) => void;
};

/** One answer of several, as radios in tiles, none chosen until the visitor chooses. */
export function Choices<T extends string>({ name, choices, value, onChange }: ChoicesProps<T>) {
  return (
    <div className="grid gap-3">
      {choices.map((choice) => (
        <label key={choice.value} className={TILE}>
          <input
            type="radio"
            name={name}
            className={MARK}
            value={choice.value}
            checked={value === choice.value}
            onChange={() => onChange(choice.value)}
          />
          {choice.label}
        </label>
      ))}
    </div>
  );
}
