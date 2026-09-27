import { describe, expect, it } from "vitest";
import { emptyParams } from "@shared/query";
import { helpWithTerms, isChecked, withField, withHelpWithTerms, withPage, withText } from "./state";

const language = { name: "Languages", value: "French", label: "French" };
const photos = { name: "OnlyProfilesWithPhotos", value: "true", label: "Only show profiles with photos" };

describe("search state", () => {
  it("adds and removes a multi-value option", () => {
    const on = withField(emptyParams(), language, true);
    expect(on.multi.Languages).toEqual(["French"]);
    expect(isChecked(on, language)).toBe(true);
    expect(withField(on, language, false).multi.Languages).toEqual([]);
  });

  it("treats the photo and wheelchair boxes as flags", () => {
    const on = withField(emptyParams(), photos, true);
    expect(on.flags.OnlyProfilesWithPhotos).toBe(true);
    expect(isChecked(on, photos)).toBe(true);
  });

  it("returns to page 1 on any change except paging", () => {
    const onPage3 = withPage(emptyParams(), 3);
    expect(withField(onPage3, language, true).page).toBe(1);
    expect(withText(onPage3, "Location", "Leeds").page).toBe(1);
    expect(withPage(onPage3, 4).page).toBe(4);
  });

  it("keeps HelpWith terms comma-separated, as UKCP's field does", () => {
    const params = withHelpWithTerms(emptyParams(), ["Anxiety", "Trauma"]);
    expect(params.text.HelpWith).toBe("Anxiety, Trauma");
    expect(helpWithTerms(params)).toEqual(["Anxiety", "Trauma"]);
  });
});
