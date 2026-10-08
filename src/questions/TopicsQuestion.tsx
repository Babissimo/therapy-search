import { useState } from "react";
import { Button } from "@/components/ui/button";
import { HelpNow } from "@/layout/HelpNow";
import { OTHER_TOPICS, THEMES, topicsQuestion, type Who } from "./answers";
import { MARK, QuestionFrame, TILE } from "./Frame";

type Props = { who: Who | undefined; topics: string[]; onChange: (topics: string[]) => void; count: string; onNext: () => void };

/** Question 3: the plain themes, and UKCP's other topics under "Something else", any number from either. */
export function TopicsQuestion({ who, topics, onChange, count, onNext }: Props) {
  const others = topics.filter((topic) => OTHER_TOPICS.includes(topic)).length;
  const [more, setMore] = useState(others > 0);
  const toggle = (topic: string, on: boolean) => onChange(on ? [...topics.filter((t) => t !== topic), topic] : topics.filter((t) => t !== topic));
  return (
    <QuestionFrame heading={topicsQuestion(who)} count={count} hint="Choose as many as you like, or none." onNext={onNext}>
      <div className="grid gap-3 sm:grid-cols-2">
        {THEMES.map(({ label, topic }) => (
          <label key={topic} className={TILE}>
            <input type="checkbox" className={MARK} checked={topics.includes(topic)} onChange={(e) => toggle(topic, e.target.checked)} />
            <span>
              {label}
              {/* UKCP's word, as the chip for it will show it. */}
              {label !== topic && <span className="block text-sm text-muted-foreground">{topic}</span>}
            </span>
          </label>
        ))}
      </div>
      <Button type="button" variant="outline" className="h-11 px-4 text-base" aria-expanded={more} onClick={() => setMore(!more)}>
        Something else{others > 0 && ` (${others} chosen)`}
      </Button>
      {more && (
        <ul className="grid gap-x-6 sm:grid-cols-2">
          {OTHER_TOPICS.map((topic) => (
            <li key={topic}>
              <label className="flex min-h-11 cursor-pointer items-center gap-3">
                <input type="checkbox" className={MARK} checked={topics.includes(topic)} onChange={(e) => toggle(topic, e.target.checked)} />
                {topic}
              </label>
            </li>
          ))}
        </ul>
      )}
      {/* Status region stays mounted so the safety-critical line is announced as it appears. */}
      <div role="status">{topics.includes("Suicide") && <HelpNow className="rounded-lg border border-border p-4" />}</div>
    </QuestionFrame>
  );
}
