// @vitest-environment jsdom
import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createShortlistStore, type ShortlistStore } from "@/shortlist/store";
import { ShortlistContext } from "@/shortlist/useShortlist";
import { NoteField } from "./NoteField";

const JO = { slug: "jo", name: "Jo Cole", initials: "JC", tags: [] };

/** The box for a shortlisted therapist, with `note` kept for them before it draws. */
function renderField(note?: string) {
  const store = createShortlistStore(null);
  store.add(JO);
  if (note !== undefined) store.setNote("jo", note);
  const view = render(
    <ShortlistContext.Provider value={store}>
      <NoteField slug="jo" />
    </ShortlistContext.Provider>,
  );
  return { store, view, box: screen.getByRole<HTMLTextAreaElement>("textbox", { name: "Your notes" }) };
}

const noteOf = (store: ShortlistStore) => store.get()[0]?.note;

afterEach(() => {
  vi.useRealTimers();
});

describe("NoteField", () => {
  it("is named Your notes, says when and where it saves, holds up to 1,000 characters and leaves spelling unchecked", () => {
    const { box } = renderField();
    expect(document.getElementById(box.getAttribute("aria-describedby")!)?.textContent).toBe("Saved as you type, in this browser only.");
    expect(box.maxLength).toBe(1000);
    expect(box.value).toBe("");
    // Enhanced spellcheck in Chrome and Edge sends what is typed to Google or Microsoft.
    expect(box.getAttribute("spellcheck")).toBe("false");
  });

  it("counts the characters left once 100 or fewer remain, which a screen reader hears as typing rests", () => {
    vi.useFakeTimers();
    const { box } = renderField();
    const hint = () => document.getElementById(box.getAttribute("aria-describedby")!)?.textContent;
    const region = document.querySelector("[aria-live=polite]")!;
    fireEvent.change(box, { target: { value: "x".repeat(899) } });
    expect(hint()).toBe("Saved as you type, in this browser only.");
    fireEvent.change(box, { target: { value: "x".repeat(900) } });
    expect(hint()).toBe("Saved as you type, in this browser only. 100 characters left.");
    expect(region.textContent).toBe("");
    act(() => vi.advanceTimersByTime(500));
    expect(region.textContent).toBe("100 characters left.");
    fireEvent.change(box, { target: { value: "x".repeat(999) } });
    expect(hint()).toBe("Saved as you type, in this browser only. 1 character left.");
    expect(region.textContent).toBe("100 characters left.");
    act(() => vi.advanceTimersByTime(500));
    expect(region.textContent).toBe("1 character left.");
  });

  it("shows the note kept for the therapist", () => {
    expect(renderField("Rang on Tuesday").box.value).toBe("Rang on Tuesday");
  });

  it("saves half a second after typing stops", () => {
    vi.useFakeTimers();
    const { store, box } = renderField();
    fireEvent.change(box, { target: { value: "Rang" } });
    act(() => vi.advanceTimersByTime(400));
    fireEvent.change(box, { target: { value: "Rang on Tuesday" } });
    act(() => vi.advanceTimersByTime(499));
    expect(noteOf(store)).toBeUndefined();
    act(() => vi.advanceTimersByTime(1));
    expect(noteOf(store)).toBe("Rang on Tuesday");
    expect(box.value).toBe("Rang on Tuesday");
  });

  it("saves at once as the box loses focus", () => {
    const { store, box } = renderField();
    fireEvent.change(box, { target: { value: "Rang" } });
    fireEvent.blur(box);
    expect(noteOf(store)).toBe("Rang");
  });

  it("saves what was typed since the last save as it goes with the profile", () => {
    const { store, box, view } = renderField();
    fireEvent.change(box, { target: { value: "Rang" } });
    view.unmount();
    expect(noteOf(store)).toBe("Rang");
  });

  it("saves what was typed since the last save as the page is hidden, as for another app, or closes", () => {
    const { store, box } = renderField();
    fireEvent.change(box, { target: { value: "Rang" } });
    act(() => void document.dispatchEvent(new Event("visibilitychange")));
    expect(noteOf(store)).toBe("Rang");
    fireEvent.change(box, { target: { value: "Rang on Tuesday" } });
    act(() => void window.dispatchEvent(new Event("pagehide")));
    expect(noteOf(store)).toBe("Rang on Tuesday");
  });

  it("keeps an emptied note as none", () => {
    vi.useFakeTimers();
    const { store, box } = renderField("Rang");
    fireEvent.change(box, { target: { value: "" } });
    act(() => vi.advanceTimersByTime(500));
    expect(noteOf(store)).toBeUndefined();
    expect(box.value).toBe("");
  });

  it("keeps what it holds, and its count, once the therapist is removed, writing nothing", () => {
    vi.useFakeTimers();
    const { store, box } = renderField("x".repeat(950));
    const region = document.querySelector("[aria-live=polite]")!;
    expect(region.textContent).toBe("50 characters left.");
    const setNote = vi.spyOn(store, "setNote");
    act(() => store.remove("jo"));
    expect(box.value).toBe("x".repeat(950));
    expect(region.textContent).toBe("50 characters left.");
    act(() => vi.runOnlyPendingTimers());
    expect(setNote).not.toHaveBeenCalled();
    // The removed entry still has its note, for when they are added back.
    act(() => void store.add(JO));
    expect(noteOf(store)).toBe("x".repeat(950));
    expect(box.value).toBe("x".repeat(950));
  });

  it("saves what was typed and not yet saved with a therapist removed, as the box goes", () => {
    const { store, box, view } = renderField("Rang");
    fireEvent.change(box, { target: { value: "Rang on Tuesday" } });
    act(() => store.remove("jo"));
    expect(box.value).toBe("Rang on Tuesday");
    view.unmount();
    store.add(JO);
    expect(noteOf(store)).toBe("Rang on Tuesday");
  });

  it("saves what was typed once the therapist is removed when typing rests, once", () => {
    vi.useFakeTimers();
    const { store, box, view } = renderField("Rang");
    act(() => store.remove("jo"));
    fireEvent.change(box, { target: { value: "Rang on Tuesday" } });
    const setNote = vi.spyOn(store, "setNote");
    act(() => vi.advanceTimersByTime(500));
    expect(setNote).toHaveBeenCalledExactlyOnceWith("jo", "Rang on Tuesday");
    // What was saved is the note last seen, so leaving saves nothing more.
    fireEvent.blur(box);
    view.unmount();
    expect(setNote).toHaveBeenCalledOnce();
    store.add(JO);
    expect(noteOf(store)).toBe("Rang on Tuesday");
  });

  it("takes a note saved elsewhere, as by another tab", () => {
    const { store, box } = renderField("Rang");
    act(() => store.setNote("jo", "Rang, and booked for Monday"));
    expect(box.value).toBe("Rang, and booked for Monday");
  });
});
