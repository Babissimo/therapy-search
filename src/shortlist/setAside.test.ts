import { describe, expect, it, vi } from "vitest";
import { createSetAsideView } from "./setAside";

describe("createSetAsideView", () => {
  it("starts closed", () => {
    expect(createSetAsideView().get()).toBe(false);
  });

  it("opens and closes, telling subscribers each time", () => {
    const view = createSetAsideView();
    const onChange = vi.fn();
    const unsubscribe = view.subscribe(onChange);
    view.toggle();
    expect(view.get()).toBe(true);
    view.toggle();
    expect(view.get()).toBe(false);
    expect(onChange).toHaveBeenCalledTimes(2);
    unsubscribe();
    view.toggle();
    expect(onChange).toHaveBeenCalledTimes(2);
  });
});
