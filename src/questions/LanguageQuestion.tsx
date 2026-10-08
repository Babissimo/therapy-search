import { useId } from "react";
import { LANGUAGES } from "./answers";
import { Choices, QuestionFrame } from "./Frame";

type Props = {
  /** Their yes or no to a language other than English. */
  other: boolean | undefined;
  onOther: (other: boolean) => void;
  language: string | undefined;
  onChange: (language: string | undefined) => void;
  count: string;
  onNext: () => void;
};

const YES_NO = [
  { value: "no", label: "No" },
  { value: "yes", label: "Yes" },
] as const;

/** Question 6. Yes offers UKCP's languages; no language chosen leaves in therapists of any. */
export function LanguageQuestion({ other, onOther, language, onChange, count, onNext }: Props) {
  // Labelled by id rather than wrapped, as a wrapping label would name the list by its chosen language too.
  const listId = useId();
  return (
    <QuestionFrame heading="Would you like therapy in a language other than English?" count={count} onNext={onNext}>
      <Choices
        name="other-language"
        choices={YES_NO}
        value={other === undefined ? undefined : other ? "yes" : "no"}
        onChange={(value) => {
          onOther(value === "yes");
          if (value === "no") onChange(undefined);
        }}
      />
      {other && (
        <div className="space-y-2">
          <label htmlFor={listId} className="block font-medium">
            Which language?
          </label>
          <select
            id={listId}
            className="h-11 w-full max-w-sm rounded-lg border border-control bg-background dark:bg-input/30 px-3 text-base"
            value={language ?? ""}
            onChange={(e) => onChange(e.target.value || undefined)}
          >
            <option value="">Choose a language</option>
            {LANGUAGES.map((name) => (
              <option key={name}>{name}</option>
            ))}
          </select>
        </div>
      )}
    </QuestionFrame>
  );
}
