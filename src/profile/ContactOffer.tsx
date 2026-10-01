import { useId } from "react";
import { Button } from "@/components/ui/button";

/** Asks whether the visitor got in touch, after they followed a phone or email link, since following one doesn't mean they did. */
export function ContactOffer({ onAnswer }: { onAnswer: (yes: boolean) => void }) {
  const question = useId();
  return (
    <div role="group" aria-labelledby={question} className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm fade-in-0 motion-safe:animate-in">
      <p id={question}>Mark as contacted?</p>
      <div className="flex gap-1">
        <Button variant="outline" size="sm" onClick={() => onAnswer(true)}>
          Yes
        </Button>
        <Button variant="ghost" size="sm" onClick={() => onAnswer(false)}>
          Not now
        </Button>
      </div>
    </div>
  );
}
