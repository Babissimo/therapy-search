// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useSavedValue } from "./useSavedValue";

afterEach(() => {
  vi.useRealTimers();
});

function renderSaved(saved = "kept") {
  const save = vi.fn();
  const view = renderHook(({ saved }) => useSavedValue(saved, save), { initialProps: { saved } });
  return { save, view };
}

describe("useSavedValue", () => {
  it("starts from what was saved, and saves an edit once typing has rested half a second", () => {
    vi.useFakeTimers();
    const { save, view } = renderSaved();
    expect(view.result.current.value).toBe("kept");
    act(() => view.result.current.set("ke"));
    act(() => vi.advanceTimersByTime(400));
    act(() => view.result.current.set("kep"));
    act(() => vi.advanceTimersByTime(400));
    expect(save).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(100));
    expect(save).toHaveBeenCalledExactlyOnceWith("kep");
  });

  it("saves an edit not yet saved as the editor goes, and as the page hides", () => {
    const { save, view } = renderSaved();
    act(() => view.result.current.set("one"));
    act(() => void window.dispatchEvent(new Event("pagehide")));
    expect(save).toHaveBeenLastCalledWith("one");
    act(() => view.result.current.set("two"));
    view.unmount();
    expect(save).toHaveBeenLastCalledWith("two");
  });

  it("saves an edit not yet saved as the page's visibility changes, the one sign some browsers give of hiding it", () => {
    const { save, view } = renderSaved();
    act(() => view.result.current.set("one"));
    act(() => void document.dispatchEvent(new Event("visibilitychange")));
    expect(save).toHaveBeenCalledExactlyOnceWith("one");
  });

  it("takes a newly saved value, as from another tab, in place of what it holds", () => {
    const { view } = renderSaved();
    view.rerender({ saved: "from elsewhere" });
    expect(view.result.current.value).toBe("from elsewhere");
  });

  it("takes another tab's value that arrives before typing rests in place of the edit, and saves nothing over it", () => {
    vi.useFakeTimers();
    const { save, view } = renderSaved();
    act(() => view.result.current.set("mine"));
    act(() => vi.advanceTimersByTime(300));
    view.rerender({ saved: "theirs" });
    expect(view.result.current.value).toBe("theirs");
    act(() => vi.advanceTimersByTime(1000));
    act(() => void window.dispatchEvent(new Event("pagehide")));
    view.unmount();
    expect(save).not.toHaveBeenCalled();
  });

  it("saves at once when asked", () => {
    const { save, view } = renderSaved();
    act(() => view.result.current.saveNow("now"));
    expect(view.result.current.value).toBe("now");
    expect(save).toHaveBeenCalledExactlyOnceWith("now");
  });

  it("saves nothing more once the saved value has caught up with an edit", () => {
    vi.useFakeTimers();
    const { save, view } = renderSaved();
    act(() => view.result.current.set("edited"));
    act(() => vi.advanceTimersByTime(500));
    view.rerender({ saved: "edited" });
    act(() => void window.dispatchEvent(new Event("pagehide")));
    view.unmount();
    expect(view.result.current.value).toBe("edited");
    expect(save).toHaveBeenCalledExactlyOnceWith("edited");
  });

  it("saves nothing as the page hides or the editor goes when nothing was edited", () => {
    const { save, view } = renderSaved();
    act(() => void window.dispatchEvent(new Event("pagehide")));
    view.unmount();
    expect(save).not.toHaveBeenCalled();
  });

  it("compares values by their contents, so a copy of what was saved neither resets an edit nor counts as one", () => {
    const save = vi.fn();
    const view = renderHook(({ saved }) => useSavedValue<{ name?: string }>(saved, save), { initialProps: { saved: { name: "Al" } } });
    act(() => view.result.current.set({ name: "Alex" }));
    view.rerender({ saved: { name: "Al" } });
    expect(view.result.current.value).toEqual({ name: "Alex" });
    act(() => view.result.current.set({ name: "Al" }));
    view.unmount();
    expect(save).not.toHaveBeenCalled();
  });

  it("forgets a value that is set to undefined", () => {
    const save = vi.fn();
    const view = renderHook(({ saved }) => useSavedValue<string | undefined>(saved, save), { initialProps: { saved: "draft" as string | undefined } });
    act(() => view.result.current.saveNow(undefined));
    expect(view.result.current.value).toBeUndefined();
    expect(save).toHaveBeenCalledExactlyOnceWith(undefined);
    view.rerender({ saved: undefined });
    expect(view.result.current.value).toBeUndefined();
    view.unmount();
    expect(save).toHaveBeenCalledTimes(1);
  });
});
