import type { SearchParams } from "./query";

/** What a card or profile says in place of how a therapist meets, where they list no types of session. */
export const UNSAID_SESSIONS = "Doesn't say how they meet";

/** UKCP's session types held in the therapist's own rooms. */
export const FACE_TO_FACE_SESSIONS: readonly string[] = ["Face to Face - Long Term", "Face to Face - Short Term"];

/**
 * Whether a search also lists those near its place who list no types of session, which any tick would leave out: as
 * it asks to meet face to face, and nearly all who do list theirs meet that way, someone with rooms nearby likely does.
 */
export function asksUnsaid(params: SearchParams): boolean {
  return params.text.Location !== "" && params.multi.TypesOfSession.some((type) => FACE_TO_FACE_SESSIONS.includes(type));
}

/** Whether a card lists no types of session. */
export function saysNothing(card: { hasSessions: boolean }): boolean {
  return !card.hasSessions;
}

/** The same search with no session types ticked, which lists those who list none among the rest. */
export function withoutSessions(params: SearchParams): SearchParams {
  return { ...params, multi: { ...params.multi, TypesOfSession: [] } };
}
