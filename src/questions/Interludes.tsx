import type { ReactNode } from "react";
import { Link } from "react-router";
import { BackButton } from "@/components/BackButton";
import { Button } from "@/components/ui/button";
import { LIST } from "@/layout/Document";
import { HelpNow } from "@/layout/HelpNow";
import { screenPath, startFor, type Answers } from "./answers";
import { ScreenHeading } from "./Frame";

/** A screen between questions, read before carrying on. */
function Interlude({ heading, children, onNext }: { heading: string; children: ReactNode; onNext: () => void }) {
  return (
    <div className="max-w-reading space-y-8">
      <BackButton label="Back" />
      <div className="space-y-4 leading-relaxed">
        <ScreenHeading>{heading}</ScreenHeading>
        {children}
      </div>
      <Button type="button" className="h-11 px-5 text-base" onClick={onNext}>
        Carry on
      </Button>
    </div>
  );
}

/** After "I need help today". */
export function HelpNowScreen({ onNext }: { onNext: () => void }) {
  return (
    <Interlude heading="If you need help today" onNext={onNext}>
      <p>A therapist found here is usually weeks from a first session. You can carry on looking for one as well.</p>
      <HelpNow />
    </Interlude>
  );
}

/**
 * After "I can't afford it". A GP can refer in all four nations; the self-referral routes each hold across their whole nation. Pages
 * as they stood on 2026-10-08:
 * - England: https://www.nhs.uk/talk and
 *   https://www.nhs.uk/mental-health/talking-therapies-medicine-treatments/talking-therapies-and-counselling/nhs-talking-therapies/
 * - Scotland: https://www.nhs24.scot/mental-health-services-at-nhs-24/ (Living Life); GP route,
 *   https://www.nhsinform.scot/tests-and-treatments/counselling-and-therapies/what-is-psychological-therapy/
 * - Wales (SilverCloud, available through NHS Wales): https://cavuhb.nhs.wales/our-services/mental-health/silvercloud,
 *   https://nhswales.silvercloudhealth.com/signup/ and
 *   https://hduhb.nhs.wales/healthcare/services-and-teams/silvercloud-online-mental-health-support/; GP route,
 *   https://111.wales.nhs.uk/counselling/
 * - Northern Ireland: https://www.nidirect.gov.uk/articles/mental-health-services-and-support (assessments start with a GP)
 */
export function LowCostScreen({ onNext }: { onNext: () => void }) {
  return (
    <Interlude heading="Free and low-cost help" onNext={onNext}>
      <p>
        Talking therapies are free on the NHS, though there is often a wait. A GP can refer you anywhere in the UK, and England, Scotland and Wales
        also have a route you can use yourself:
      </p>
      <ul className={LIST}>
        <li>
          In England, from 18 (16 in some areas), you can refer yourself to NHS Talking Therapies:{" "}
          <a className="underline" href="https://www.nhs.uk/talk">
            find a service near you
          </a>
          .
        </li>
        <li>
          In Scotland, from 16, if you are registered with a GP there, you can refer yourself by phone to NHS 24's Living Life therapy service for
          mild to moderate difficulties:{" "}
          <a className="underline" href="https://www.nhs24.scot/mental-health-services-at-nhs-24/">
            about Living Life
          </a>
          .
        </li>
        <li>
          In Wales, from 16, you can sign yourself up to NHS Wales's free online SilverCloud programmes for mild to moderate anxiety, depression or
          stress:{" "}
          <a className="underline" href="https://hduhb.nhs.wales/healthcare/services-and-teams/silvercloud-online-mental-health-support/">
            about SilverCloud
          </a>
          .
        </li>
      </ul>
      <p>Local mental health charities often offer counselling for free or at a low cost.</p>
      <p>Some therapists here charge less to people on low incomes, so it's worth asking when you get in touch.</p>
    </Interlude>
  );
}

/** The end, where the answers give nothing to narrow a search by, which the start screens wouldn't search either. */
export function NothingScreen({ answers }: { answers: Answers }) {
  const start = startFor(answers);
  const everyone = answers.meet === "remote" ? "every UKCP therapist working online or by phone" : "every UKCP therapist near you";
  return (
    <div className="max-w-reading space-y-8">
      <BackButton label="Back" />
      <div className="space-y-4 leading-relaxed">
        <ScreenHeading>Nothing to search by yet</ScreenHeading>
        <p>None of your answers narrows the search, so it would list {everyone}. Go back and choose something, or pick filters yourself.</p>
      </div>
      <div className="flex flex-wrap gap-3">
        <Button asChild className="h-11 px-5 text-base">
          <Link to={screenPath("urgency")}>Back to the questions</Link>
        </Button>
        <Button asChild variant="outline" className="h-11 px-5 text-base">
          <Link to={start.to} state={start.state}>
            Choose filters yourself
          </Link>
        </Button>
      </div>
    </div>
  );
}
