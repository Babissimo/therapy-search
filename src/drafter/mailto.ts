import type { EmailDraft } from "@/shortlist/store";

/** About how long a `mailto:` link every common email app takes whole; some cut a longer one short. */
export const MAILTO_SAFE = 2000;

/** An email to `address`, for the visitor's email app to open, with line breaks as RFC 6068 asks. */
export function mailtoHref(address: string, { subject, message }: EmailDraft): string {
  const body = message.replace(/\r?\n/g, "\r\n");
  return `mailto:${address}?subject=${encoded(subject)}&body=${encoded(body)}`;
}

/**
 * `text` percent-encoded, with any lone surrogate (half an emoji, as cutting a draft to its limit can leave) made U+FFFD
 * first, as `encodeURIComponent` throws on one. Not `toWellFormed`, which Firefox has only from 119.
 */
function encoded(text: string): string {
  return encodeURIComponent(text.replace(/\p{Surrogate}/gu, "\uFFFD"));
}

/** The draft as copied, for a contact form or notes for a call. */
export function copiedText({ subject, message }: EmailDraft): string {
  return `Subject: ${subject}\n\n${message}`;
}
