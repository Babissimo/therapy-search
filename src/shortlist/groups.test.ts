import { describe, expect, it, vi } from "vitest";
import { createClosedGroups } from "./groups";

describe("createClosedGroups", () => {
  it("starts with only Set aside closed", () => {
    expect([...createClosedGroups().get()]).toEqual(["setAside"]);
  });

  it("opens and closes a group, telling subscribers each time", () => {
    const groups = createClosedGroups();
    const onChange = vi.fn();
    groups.subscribe(onChange);
    groups.toggle("setAside");
    groups.toggle("contacted");
    expect([...groups.get()]).toEqual(["contacted"]);
    expect(onChange).toHaveBeenCalledTimes(2);
  });

  it("returns the same set until it changes", () => {
    const groups = createClosedGroups();
    const before = groups.get();
    expect(groups.get()).toBe(before);
    groups.toggle("seeing");
    expect(groups.get()).not.toBe(before);
    expect(before.has("seeing")).toBe(false);
  });
});
