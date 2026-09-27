import { describe, expect, it } from "vitest";
import { optionsDiff } from "./optionsFile";

const base = { helpWith: ["Anxiety"], groups: [{ label: "Languages", fields: [{ name: "Languages", value: "French", label: "French" }] }] };

describe("optionsDiff", () => {
  it("is empty when nothing changed", () => {
    expect(optionsDiff(base, structuredClone(base))).toEqual([]);
  });

  it("names what UKCP added and removed", () => {
    const live = { helpWith: ["Anxiety", "Grief"], groups: [{ label: "Languages", fields: [{ name: "Languages", value: "Welsh", label: "Welsh" }] }] };
    expect(optionsDiff(base, live)).toEqual(["added   HelpWith: Grief", "added   Languages: Welsh", "removed Languages: French"]);
  });

  it("names wording UKCP changed without changing the value", () => {
    const live = { helpWith: ["Anxiety"], groups: [{ label: "Languages", help: "Pick one", fields: [{ name: "Languages", value: "French", label: "Français" }] }] };
    expect(optionsDiff(base, live)).toEqual(["changed help for Languages", "changed label of Languages: French"]);
  });
});
