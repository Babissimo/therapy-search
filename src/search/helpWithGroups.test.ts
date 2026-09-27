import { describe, expect, it } from "vitest";
import { helpWithGroups } from "./helpWithGroups";

const field = (name: string, value: string) => ({ name, value, label: value });

describe("helpWithGroups", () => {
  it("splits the terms into issues and therapy types, keeping UKCP's order", () => {
    const options = {
      helpWith: ["Anxiety", "Gestalt Psychotherapist", "Trauma"],
      groups: [
        { label: "I Want Help With", fields: [field("HelpWithAdvanced", "Trauma"), field("HelpWithAdvanced", "Anxiety")] },
        { label: "Type of Therapy", fields: [field("TypesOfTherapy", "Gestalt Psychotherapist")] },
      ],
    };
    expect(helpWithGroups(options)).toEqual([
      { heading: "Issues", terms: ["Anxiety", "Trauma"] },
      { heading: "Types of therapy", terms: ["Gestalt Psychotherapist"] },
    ]);
  });

  it("keeps a term found in neither panel group, under Other", () => {
    const options = { helpWith: ["Anxiety", "Grief"], groups: [{ label: "I Want Help With", fields: [field("HelpWithAdvanced", "Anxiety")] }] };
    expect(helpWithGroups(options).at(-1)).toEqual({ heading: "Other", terms: ["Grief"] });
  });
});
