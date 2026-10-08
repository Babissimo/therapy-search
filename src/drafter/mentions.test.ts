import { describe, expect, it } from "vitest";
import { emptyParams, type SearchParams } from "@shared/query";
import type { Profile } from "@shared/types";
import { CRISIS_KEY, mentionsOf, type Mention } from "./mentions";

function search(change: (params: SearchParams) => void): SearchParams {
  const params = emptyParams();
  change(params);
  return params;
}

const PROFILE: Profile = {
  slug: "Jo-ABCDEFGH",
  name: "Jo Bloggs",
  initials: "JB",
  languages: [],
  emailInContact: false,
  social: [],
  about: [],
  practical: [],
  offices: [],
};
const section = (heading: string, items: string[]) => ({ heading, paragraphs: [], items, details: [] });
const said = (mentions: Mention[]) => mentions.map((m) => [m.label, m.words]);

describe("mentionsOf", () => {
  it("mentions nothing the therapist would make nothing of: colleges, photos only, the keyword", () => {
    const params = search((p) => {
      p.multi.Colleges = ["Constructivist and Existential College (CEC)"];
      p.flags.OnlyProfilesWithPhotos = true;
      p.text.KeywordFilter = "LGBTQ";
    });
    expect(mentionsOf(params)).toEqual([]);
  });

  it("says who the help is for, leaving companies out", () => {
    const params = search((p) => (p.multi.WorksWith = ["Individuals", "Couples", "Companies"]));
    expect(said(mentionsOf(params))).toEqual([
      ["Individuals", "a therapist for myself"],
      ["Couples", "couples therapy with my partner"],
    ]);
  });

  it("words each help-with term in lower case, but for words in capitals", () => {
    const params = search((p) => (p.multi.HelpWithAdvanced = ["Anxiety", "ADHD", "Post-Traumatic Stress", "AIDS/HIV"]));
    expect(said(mentionsOf(params))).toEqual([
      ["Anxiety", "anxiety"],
      ["ADHD", "ADHD"],
      ["Post-Traumatic Stress", "post-traumatic stress"],
      ["AIDS/HIV", "AIDS/HIV"],
    ]);
  });

  it("rewords terms that don't read after 'help with', once for terms worded alike", () => {
    const params = search(
      (p) => (p.multi.HelpWithAdvanced = ["Suicide", "Sex Offenders", "Those at Risk of Sexual Offending", "Workplace Counselling", "Parents"]),
    );
    expect(said(mentionsOf(params))).toEqual([
      ["Suicidal thoughts", "suicidal thoughts"],
      ["A risk of sexual offending", "a risk of sexual offending"],
      ["Problems at work", "problems at work"],
      ["Parenting", "parenting"],
    ]);
    expect(mentionsOf(params)[0]?.key).toBe(CRISIS_KEY);
  });

  it("rewords the terms of identity, family and the trade, once for terms worded alike", () => {
    const params = search(
      (p) => (p.multi.HelpWithAdvanced = ["Gender", "Transgender", "Family", "Supervision", "Training", "Private Practice Issues"]),
    );
    expect(said(mentionsOf(params))).toEqual([
      ["Gender identity", "gender identity"],
      ["Family issues", "family issues"],
      ["Clinical supervision", "clinical supervision"],
      ["My training as a therapist", "my training as a therapist"],
      ["Running a private practice", "running a private practice"],
    ]);
  });

  it("places each HelpWith term by the list it belongs to, as one with a tick of the same name", () => {
    const params = search((p) => {
      p.text.HelpWith = "Anxiety, Gestalt Psychotherapist, EMDR, Online Counselling";
      p.multi.HelpWithAdvanced = ["Anxiety"];
    });
    expect(mentionsOf(params).map((m) => [m.topic, m.words])).toEqual([
      ["help", "anxiety"],
      ["approach", "EMDR"],
      ["type", "a Gestalt Psychotherapist"],
      ["how", "online"],
    ]);
  });

  it("gives each type of therapy an article by its sound", () => {
    const params = search((p) => (p.multi.TypesOfTherapy = ["Integrative Psychotherapist", "UTC Psychotherapist", "Psychodynamic Psychotherapist"]));
    expect(mentionsOf(params).map((m) => m.words)).toEqual([
      "an Integrative Psychotherapist",
      "a UTC Psychotherapist",
      "a Psychodynamic Psychotherapist",
    ]);
  });

  it("says how to meet, once for in person, with the term of the work where only one is sought", () => {
    const long = search((p) => (p.multi.TypesOfSession = ["Face to Face - Long Term", "Online Therapy", "Home Visits", "Telephone Therapy"]));
    expect(mentionsOf(long).map((m) => [m.label, m.words, m.term])).toEqual([
      ["In person", "in person", "longer-term"],
      ["At home", "at home", undefined],
      ["Online", "online", undefined],
      ["By phone", "by phone", undefined],
    ]);
    const both = search((p) => (p.multi.TypesOfSession = ["Face to Face - Long Term", "Face to Face - Short Term"]));
    expect(mentionsOf(both).map((m) => [m.label, m.term])).toEqual([["In person", undefined]]);
  });

  it("keeps types of therapy, ways of meeting and languages to those the profile lists", () => {
    const params = search((p) => {
      p.multi.TypesOfTherapy = ["Gestalt Psychotherapist", "Psychodynamic Psychotherapist"];
      p.multi.TypesOfSession = ["Face to Face - Long Term", "Face to Face - Short Term", "Online Therapy"];
      p.multi.Languages = ["Polish", "Welsh"];
    });
    const profile: Profile = {
      ...PROFILE,
      languages: ["English", "Polish"],
      about: [section("Types of Therapies Offered", ["Psychodynamic Psychotherapist"])],
      practical: [section("Types of sessions", ["Face to Face - Short Term"])],
    };
    expect(mentionsOf(params, profile).map((m) => [m.label, m.term])).toEqual([
      ["Psychodynamic Psychotherapist", undefined],
      ["In person", "short-term"],
      ["Polish", undefined],
    ]);
  });

  it("keeps all that was searched of a kind the profile lists nothing of", () => {
    const params = search((p) => {
      p.multi.TypesOfSession = ["Online Therapy"];
      p.multi.Languages = ["Polish"];
    });
    expect(mentionsOf(params, PROFILE).map((m) => m.label)).toEqual(["Online", "Polish"]);
  });

  it("says the place as typed, and a postcode by its outward code alone", () => {
    const at = (location: string) => said(mentionsOf(search((p) => (p.text.Location = location))));
    expect(at("Leeds")).toEqual([["Near Leeds", "near Leeds"]]);
    expect(at("ls6 3ab")).toEqual([["In the LS6 area", "in the LS6 area"]]);
    expect(at("LS63AB")).toEqual([["In the LS6 area", "in the LS6 area"]]);
    expect(at("LS6")).toEqual([["In the LS6 area", "in the LS6 area"]]);
    expect(at("SW1A 1AA")).toEqual([["In the SW1A area", "in the SW1A area"]]);
    expect(at("sw1a1aa")).toEqual([["In the SW1A area", "in the SW1A area"]]);
    expect(at("EC1A")).toEqual([["In the EC1A area", "in the EC1A area"]]);
  });

  it("never says more of a postcode than its outward code, however it was typed or what surrounds it", () => {
    const area = [["In the LS6 area", "in the LS6 area"]];
    const typings = ["LS6  3AB", "LS6\u00a03AB", "LS6-3AB", "LS6 - 3AB", "LS6 -3AB", "LS6- 3AB", "LS6\u200b3AB", "LS6\u200b 3AB", "LS6 3AB."];
    for (const typed of [...typings, "12 Acacia Road, LS6 3AB", " LS6 3AB "]) {
      expect(said(mentionsOf(search((p) => (p.text.Location = typed)))), JSON.stringify(typed)).toEqual(area);
    }
  });

  it("says a place with its spaces single, and no zero-width characters", () => {
    const params = search((p) => (p.text.Location = "Leeds\u00a0 city  \u200bcentre\ufeff"));
    expect(said(mentionsOf(params))).toEqual([["Near Leeds city centre", "near Leeds city centre"]]);
  });

  it("matches a language to the profile's whatever its spaces, and says it with plain ones", () => {
    const params = search((p) => (p.multi.Languages = ["Yue\u00a0(Cantonese)"]));
    for (const listed of ["Yue (Cantonese)", "Yue\u00a0(Cantonese)"]) {
      const profile: Profile = { ...PROFILE, languages: ["English", listed] };
      expect(said(mentionsOf(params, profile)), JSON.stringify(listed)).toEqual([["Yue (Cantonese)", "Yue (Cantonese)"]]);
    }
  });

  it("asks about wheelchair access and private health insurance", () => {
    const params = search((p) => {
      p.flags.OnlyWheelchairAccessible = true;
      p.multi.WorksWith = ["Private healthcare referrals"];
    });
    expect(said(mentionsOf(params))).toEqual([
      ["Wheelchair access", "whether your room is wheelchair accessible"],
      ["Private health insurance", "whether you accept clients through private health insurance"],
    ]);
  });

  it("lists mentions in the order the message says them", () => {
    const params = search((p) => {
      p.flags.OnlyWheelchairAccessible = true;
      p.text.Location = "Leeds";
      p.multi.Languages = ["Polish"];
      p.multi.TypesOfSession = ["Online Therapy"];
      p.multi.TypesOfTherapy = ["Gestalt Psychotherapist"];
      p.multi.HelpWithAdvanced = ["Anxiety"];
      p.multi.WorksWith = ["Individuals"];
    });
    expect(mentionsOf(params).map((m) => m.topic)).toEqual(["who", "help", "type", "how", "language", "place", "access"]);
  });
});
