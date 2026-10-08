import { useEffect, useState } from "react";
import { Link, Navigate, useNavigate, useParams } from "react-router";
import { tabStorage } from "@/lib/storage";
import {
  destination,
  isScreen,
  nextScreen,
  questionsFor,
  readAnswers,
  screenPath,
  screensFor,
  startFor,
  writeAnswers,
  type Answers,
  type Meet,
  type Pay,
  type Question,
  type Screen,
  type Urgency,
  type Who,
} from "./answers";
import { Choices, QuestionFrame } from "./Frame";
import { HelpNowScreen, LowCostScreen, NothingScreen } from "./Interludes";
import { LanguageQuestion } from "./LanguageQuestion";
import { PlaceQuestion } from "./PlaceQuestion";
import { TopicsQuestion } from "./TopicsQuestion";

const URGENCY: readonly { value: Urgency; label: string }[] = [
  { value: "today", label: "I need help today" },
  { value: "wait", label: "It can wait a few weeks" },
];
const WHO: readonly { value: Who; label: string }[] = [
  { value: "me", label: "Me" },
  { value: "child", label: "My child or teenager" },
  { value: "partner", label: "Me and my partner" },
  { value: "family", label: "My family" },
  { value: "unsure", label: "Not sure" },
];
const MEET: readonly { value: Meet; label: string }[] = [
  { value: "inPerson", label: "In person" },
  { value: "remote", label: "Online or by phone" },
  { value: "either", label: "Either" },
  { value: "unsure", label: "Not sure" },
];
const STEP_FREE = [
  { value: "yes", label: "Yes" },
  { value: "no", label: "No" },
] as const;
const PAY: readonly { value: Pay; label: string }[] = [
  { value: "self", label: "Myself" },
  { value: "insurer", label: "A health insurer" },
  { value: "cannot", label: "I can't afford it" },
  { value: "unsure", label: "Not sure" },
];

/** The questions, a screen at a time, each its own history entry, with the answers kept for the tab as they are given. */
export function QuestionsPage() {
  const { screen = "urgency" } = useParams();
  const navigate = useNavigate();
  const [answers, setAnswers] = useState(() => readAnswers(tabStorage()));
  useEffect(() => writeAnswers(tabStorage(), answers), [answers]);
  // A screen the answers now skip, as Forward can reach after one changes, starts the questions again.
  if (!isScreen(screen) || (screen !== "end" && !screensFor(answers).includes(screen))) return <Navigate to={screenPath("urgency")} replace />;
  if (screen === "end") {
    const to = destination(answers);
    // In the end's place, so Back from the search returns to the last question.
    return to ? <Navigate to={to} replace /> : <NothingScreen answers={answers} />;
  }
  const give = (more: Partial<Answers>) => setAnswers((was) => ({ ...was, ...more }));
  const next = () => void navigate(screenPath(nextScreen(answers, screen)));
  const start = startFor(answers);
  return (
    <div className="space-y-8">
      {/* Keyed, so each screen is drawn afresh and its heading takes the keyboard. */}
      <Shown key={screen} screen={screen} answers={answers} give={give} next={next} />
      {/* Outside the screen's fieldset and form, so it is no part of the answers and Enter never presses it. */}
      <p className="max-w-reading">
        <Link className="underline" to={start.to} state={start.state}>
          Choose filters yourself
        </Link>
      </p>
    </div>
  );
}

type ShownProps = { screen: Exclude<Screen, "end">; answers: Answers; give: (more: Partial<Answers>) => void; next: () => void };

function Shown({ screen, answers, give, next }: ShownProps) {
  const questions = questionsFor(answers);
  const count = (question: Question) => `Question ${questions.indexOf(question) + 1} of ${questions.length}`;
  switch (screen) {
    case "help-now":
      return <HelpNowScreen onNext={next} />;
    case "low-cost":
      return <LowCostScreen onNext={next} />;
    case "urgency":
      return (
        <QuestionFrame heading="Is it urgent?" count={count(screen)} onNext={next}>
          <Choices name={screen} choices={URGENCY} value={answers.urgency} onChange={(urgency) => give({ urgency })} />
        </QuestionFrame>
      );
    case "who":
      return (
        <QuestionFrame heading="Who is it for?" count={count(screen)} onNext={next}>
          <Choices name={screen} choices={WHO} value={answers.who} onChange={(who) => give({ who })} />
        </QuestionFrame>
      );
    case "topics":
      return <TopicsQuestion who={answers.who} topics={answers.topics} onChange={(topics) => give({ topics })} count={count(screen)} onNext={next} />;
    case "meet":
      return (
        <QuestionFrame heading="How do you want to meet?" count={count(screen)} onNext={next}>
          <Choices name={screen} choices={MEET} value={answers.meet} onChange={(meet) => give({ meet })} />
        </QuestionFrame>
      );
    case "place":
      return <PlaceQuestion place={answers.place} onChange={(place) => give({ place })} count={count(screen)} onNext={next} />;
    case "language":
      return (
        <LanguageQuestion
          other={answers.otherLanguage}
          onOther={(otherLanguage) => give({ otherLanguage })}
          language={answers.language}
          onChange={(language) => give({ language })}
          count={count(screen)}
          onNext={next}
        />
      );
    case "access":
      return (
        <QuestionFrame heading="Do you need step-free access?" count={count(screen)} hint="For a wheelchair, or if stairs are hard for you." onNext={next}>
          <Choices
            name={screen}
            choices={STEP_FREE}
            value={answers.stepFree === undefined ? undefined : answers.stepFree ? "yes" : "no"}
            onChange={(value) => give({ stepFree: value === "yes" })}
          />
        </QuestionFrame>
      );
    case "pay":
      return (
        <QuestionFrame heading="How will you pay?" count={count(screen)} onNext={next}>
          <Choices name={screen} choices={PAY} value={answers.pay} onChange={(pay) => give({ pay })} />
        </QuestionFrame>
      );
  }
}
