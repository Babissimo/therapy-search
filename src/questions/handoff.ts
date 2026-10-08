/** What the questions send a start screen with, as its history entry's state: the place typed, for its box. */
export type Handoff = { place: string };

/** The place a history entry's state sends, if it is a hand-off from the questions. */
export function placeSent(state: unknown): string | undefined {
  return typeof state === "object" && state !== null && "place" in state && typeof state.place === "string" ? state.place : undefined;
}
