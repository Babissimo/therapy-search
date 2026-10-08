import { useQuery } from "@tanstack/react-query";
import { Copy, Mail } from "lucide-react";
import type { Ref } from "react";
import { ukcpProfileUrl } from "@shared/query";
import type { ContactDetails, Profile } from "@shared/types";
import { ErrorLine } from "@/components/ErrorLine";
import { FailureStatus, useFailure } from "@/components/FailedAlert";
import { SkeletonText } from "@/components/SkeletonText";
import { Button } from "@/components/ui/button";
import { NEW_TAB } from "@/lib/newTab";
import { contactQuery, emailOf, shortUrl } from "@/profile/ContactList";
import type { EmailDraft } from "@/shortlist/store";
import { copiedText, MAILTO_SAFE, mailtoHref } from "./mailto";
import type { Reach } from "./Reached";

type Props = {
  draft: EmailDraft;
  /** What the therapist is called in a line about them. */
  first: string;
  /** None where it couldn't be read, when only copying is offered. */
  profile?: Profile;
  /** As the draft goes on, or the clipboard refuses it, with the control it went by. */
  onReached: (reach: Reach, control: HTMLElement) => void;
};

async function copy(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/** Where the draft goes: the visitor's email app, addressed to the therapist, or their clipboard, with what UKCP has where it gives no email. */
export function SendDraft({ draft, first, profile, onReached }: Props) {
  // Asked only where the profile has no email: with one, the draft goes to it and nothing else is wanted.
  const contact = useQuery(contactQuery(profile?.email ? undefined : profile?.contactId));
  // Held while asked again, so Try again keeps the keyboard until what it brings takes it.
  const failure = useFailure<HTMLAnchorElement>(contact, profile?.contactId ?? "");
  const email = profile && emailOf(profile, contact.data);
  const href = email && mailtoHref(email, draft);
  // Shown, and said in place of the error's own message, which doesn't say what failed.
  const unread = `${first}'s contact details couldn't be read.`;

  return (
    <div>
      <FailureStatus failure={failure} saying={unread} />
      <div className="flex flex-wrap gap-2">
        {href && (
          <Button asChild>
            <a
              ref={failure.landing}
              href={href}
              onClick={(event) => {
                const link = event.currentTarget;
                // Some email apps cut a long link short, so the message goes on the clipboard too, and the question waits to say whether it did.
                if (href.length > MAILTO_SAFE) void copy(draft.message).then((ok) => onReached(ok ? "emailed and copied" : "emailed", link));
                else onReached("emailed", link);
              }}
            >
              <Mail aria-hidden />
              Open in email app
            </a>
          </Button>
        )}
        <Button
          variant="outline"
          onClick={async (event) => {
            const button = event.currentTarget;
            onReached((await copy(copiedText(draft))) ? "copied" : "refused", button);
          }}
        >
          <Copy aria-hidden />
          Copy message
        </Button>
      </div>
      {profile && !email && (
        <div className="mt-3 text-sm">
          {failure.error ? (
            <ErrorLine quiet>
              {unread}{" "}
              <Button
                variant="link"
                size="sm"
                className="h-auto p-0 aria-disabled:opacity-50"
                // Not disabled while retrying, which would drop focus; a second press is ignored.
                aria-disabled={failure.retrying}
                onClick={failure.retrying ? undefined : failure.retry}
              >
                Try again
              </Button>
            </ErrorLine>
          ) : contact.isLoading ? (
            <>
              <SkeletonText className="w-64" />
              <span className="sr-only">Loading contact details</span>
            </>
          ) : (
            <Elsewhere first={first} profile={profile} contact={contact.data} landing={failure.landing} onReached={onReached} />
          )}
        </div>
      )}
    </div>
  );
}

type ElsewhereProps = {
  first: string;
  profile: Profile;
  contact?: ContactDetails;
  /** Where the keyboard goes once contact details that failed to load arrive: the first link. */
  landing: Ref<HTMLAnchorElement>;
  onReached: (reach: Reach, control: HTMLElement) => void;
};

/** What UKCP gives in place of an email: a phone number, a website, or nothing, with the therapist's UKCP page after. */
function Elsewhere({ first, profile, contact = {}, landing, onReached }: ElsewhereProps) {
  const { phone, website } = contact;
  const link = "underline underline-offset-3";
  return (
    <p>
      {phone ? (
        <>
          {first} gives a phone number rather than an email address:{" "}
          <a
            ref={landing}
            translate="no"
            className={link}
            href={`tel:${phone.replace(/\s/g, "")}`}
            onClick={(event) => onReached("phoned", event.currentTarget)}
          >
            {phone}
          </a>
          . The message works as notes for the call.
        </>
      ) : website ? (
        <>
          {first} gives a website rather than an email address:{" "}
          <a
            ref={landing}
            translate="no"
            className={link}
            href={website}
            target="_blank"
            rel="noreferrer"
            aria-label={`${shortUrl(website)} ${NEW_TAB}`}
          >
            {shortUrl(website)}
          </a>
          .
        </>
      ) : (
        <>UKCP shows no way to reach {first}.</>
      )}{" "}
      <a
        ref={phone || website ? undefined : landing}
        className={link}
        href={ukcpProfileUrl(profile.slug)}
        target="_blank"
        rel="noreferrer"
        aria-label={`View on UKCP ${NEW_TAB}`}
      >
        View on UKCP
      </a>
    </p>
  );
}
