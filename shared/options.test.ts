import { describe, expect, it } from "vitest";
import { ALLOWED, allowedFrom, OPTIONS } from "./options";

describe("allowed values", () => {
  it("collects each multi-value parameter's options and the help-with terms, and skips the flags", () => {
    const allowed = allowedFrom({
      helpWith: ["Anxiety"],
      groups: [
        {
          label: "Mixed",
          fields: [
            { name: "Languages", value: "Welsh", label: "Welsh" },
            { name: "OnlyProfilesWithPhotos", value: "true", label: "Only show profiles with photos" },
          ],
        },
      ],
    });
    expect([...allowed.Languages]).toEqual(["Welsh"]);
    expect([...allowed.HelpWith]).toEqual(["Anxiety"]);
    expect(allowed.Colleges.size).toBe(0);
  });

  it("has options for every multi-value parameter in the committed lists", () => {
    for (const values of Object.values(ALLOWED)) expect(values.size).toBeGreaterThan(0);
    expect(OPTIONS.helpWith.length).toBeGreaterThan(0);
  });
});
