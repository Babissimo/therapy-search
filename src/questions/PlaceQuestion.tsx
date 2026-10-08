import { TEXT_MAX_LENGTH } from "@shared/query";
import { Input } from "@/components/ui/input";
import { QuestionFrame } from "./Frame";

type Props = { place: string; onChange: (place: string) => void; count: string; onNext: () => void };

/** Question 5, for meeting in person or either way. The search tells them if UKCP doesn't know the place. */
export function PlaceQuestion({ place, onChange, count, onNext }: Props) {
  return (
    <QuestionFrame heading="Where are you?" count={count} hint="A postcode finds the nearest therapists. A town or city works too." onNext={onNext}>
      <Input
        aria-label="Postcode or town"
        placeholder="Postcode or town"
        autoComplete="postal-code"
        maxLength={TEXT_MAX_LENGTH}
        value={place}
        onChange={(e) => onChange(e.target.value)}
        className="h-11 max-w-sm text-base md:text-base"
      />
    </QuestionFrame>
  );
}
