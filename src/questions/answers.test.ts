import { describe, expect, it } from "vitest";
import { OPTIONS } from "@shared/options";
import { toQuery } from "@shared/query";
import {
  ANSWERS_KEY,
  destination,
  LANGUAGES,
  NO_ANSWERS,
  nextScreen,
  OTHER_TOPICS,
  PAYS,
  questionsFor,
  readAnswers,
  screensFor,
  searchOf,
  startFor,
  THEMES,
  topicsQuestion,
  WHOS,
  writeAnswers,
  type Answers,
} from "./answers";

const answered = (more: Partial<Answers>): Answers => ({ ...NO_ANSWERS, ...more });

/** A store like the tab's, kept in memory. */
function memory(): Pick<Storage, "getItem" | "setItem"> {
  const items = new Map<string, string>();
  return { getItem: (key) => items.get(key) ?? null, setItem: (key, value) => void items.set(key, value) };
}

const helpWith = OPTIONS.groups.find((g) => g.label === "I Want Help With")!.fields.map((f) => f.value);

describe("the screens", () => {
  it("asks all eight questions unless they meet online or by phone, which needs no place and no step-free way in", () => {
    expect(questionsFor(NO_ANSWERS)).toEqual(["urgency", "who", "topics", "meet", "place", "language", "access", "pay"]);
    expect(questionsFor(answered({ meet: "remote" }))).toEqual(["urgency", "who", "topics", "meet", "language", "pay"]);
  });

  it("shows help now after an urgent answer and low-cost help after I can't afford it", () => {
    expect(screensFor(answered({ urgency: "today", pay: "cannot" }))).toEqual([
      "urgency",
      "help-now",
      "who",
      "topics",
      "meet",
      "place",
      "language",
      "access",
      "pay",
      "low-cost",
    ]);
  });

  it("goes on to the next screen that applies, and after the last to the end", () => {
    expect(nextScreen(answered({ meet: "remote" }), "meet")).toBe("language");
    expect(nextScreen(NO_ANSWERS, "pay")).toBe("end");
    expect(nextScreen(answered({ pay: "cannot" }), "low-cost")).toBe("end");
  });
});

describe("the topics", () => {
  it("names each theme by one of UKCP's topics", () => {
    for (const { topic } of THEMES) expect(helpWith).toContain(topic);
  });

  it("offers UKCP's other topics under Something else, less the themes and what concerns therapists' own work", () => {
    for (const topic of ["Suicide", "Phobias", "Infertility"]) expect(OTHER_TOPICS).toContain(topic);
    for (const topic of ["Anxiety", "EMDR", "Online Counselling", "Telephone Counselling", "Supervision", "Training", "Private Practice Issues"]) {
      expect(OTHER_TOPICS).not.toContain(topic);
    }
  });

  it("words question 3 for whoever it is for", () => {
    expect(topicsQuestion(undefined)).toBe("What would you like help with?");
    expect(topicsQuestion("me")).toBe("What would you like help with?");
    expect(topicsQuestion("child")).toBe("What would your child like help with?");
    expect(topicsQuestion("partner")).toBe("What would you both like help with?");
    expect(topicsQuestion("family")).toBe("What would your family like help with?");
  });

  it("offers every language but English", () => {
    expect(LANGUAGES).toContain("Welsh");
    expect(LANGUAGES).not.toContain("English");
  });
});

describe("searchOf", () => {
  it("sets nothing for answers that narrow nothing: Me, Either, Myself, Not sure and no step-free way in", () => {
    const { online, params } = searchOf(answered({ urgency: "wait", who: "me", meet: "either", pay: "self", stepFree: false }));
    expect(online).toBe(false);
    expect(toQuery(params)).toBe("");
    expect(toQuery(searchOf(answered({ who: "unsure", meet: "unsure", pay: "unsure" })).params)).toBe("");
  });

  it("ticks who they work with, what they help with, how they meet, the language and step-free access, near the place", () => {
    const { params } = searchOf(
      answered({
        who: "partner",
        topics: ["Anxiety", "Bereavement"],
        meet: "inPerson",
        place: "Bristol BS6",
        otherLanguage: true,
        language: "Welsh",
        stepFree: true,
        pay: "insurer",
      }),
    );
    expect(toQuery(params)).toBe(
      "Location=Bristol+BS6&TypesOfSession=Face+to+Face+-+Long+Term&TypesOfSession=Face+to+Face+-+Short+Term&TypesOfSession=Home+Visits" +
        "&HelpWithAdvanced=Anxiety&HelpWithAdvanced=Bereavement&WorksWith=Couples&WorksWith=Private+healthcare+referrals&Languages=Welsh" +
        "&OnlyWheelchairAccessible=true",
    );
  });

  it("leaves the place and step-free access out for online or by phone, whose view asks for both kinds of session itself", () => {
    const { online, params } = searchOf(answered({ meet: "remote", place: "Leeds", stepFree: true, topics: ["Trauma"] }));
    expect(online).toBe(true);
    expect(toQuery(params)).toBe("HelpWithAdvanced=Trauma");
  });

  it("ticks only boxes UKCP offers, for whoever it is for, however they pay and in person", () => {
    const fields = OPTIONS.groups.flatMap((g) => g.fields);
    for (const who of WHOS) {
      for (const pay of PAYS) {
        const { params } = searchOf(answered({ who, pay, meet: "inPerson" }));
        for (const [name, values] of Object.entries(params.multi)) {
          for (const value of values) expect(fields.some((f) => f.name === name && f.value === value), `${name}=${value}`).toBe(true);
        }
      }
    }
  });
});

describe("destination", () => {
  it("is the search near the place", () => {
    expect(destination(answered({ topics: ["Trauma"], place: "Leeds" }))).toBe("/?Location=Leeds&HelpWithAdvanced=Trauma");
  });

  it("is the Near me start with the ticks, waiting for a place, where none was given", () => {
    expect(destination(answered({ topics: ["Trauma"] }))).toBe("/?HelpWithAdvanced=Trauma");
  });

  it("is the online search for online or by phone", () => {
    expect(destination(answered({ meet: "remote", topics: ["Trauma"] }))).toBe("/online?HelpWithAdvanced=Trauma");
  });

  it("is nothing where the answers narrow nothing, near a place or online", () => {
    expect(destination(answered({ place: "Leeds", who: "me", meet: "either" }))).toBeUndefined();
    expect(destination(answered({ meet: "remote" }))).toBeUndefined();
  });
});

describe("startFor", () => {
  it("is the start screen for the way they chose to meet, with the place they typed", () => {
    expect(startFor(answered({ meet: "remote", place: "Leeds" }))).toEqual({ to: "/online" });
    expect(startFor(answered({ place: " Leeds " }))).toEqual({ to: "/", state: { place: "Leeds" } });
    expect(startFor(NO_ANSWERS)).toEqual({ to: "/" });
  });
});

describe("kept answers", () => {
  it("reads back what was written", () => {
    const storage = memory();
    const answers = answered({
      urgency: "wait",
      who: "child",
      topics: ["Anxiety", "Suicide"],
      meet: "inPerson",
      place: "Leeds",
      otherLanguage: true,
      language: "Welsh",
      stepFree: true,
      pay: "insurer",
    });
    writeAnswers(storage, answers);
    expect(readAnswers(storage)).toEqual(answers);
  });

  it("keeps a no to another language, and a language only with its yes", () => {
    const storage = memory();
    writeAnswers(storage, answered({ otherLanguage: false }));
    expect(readAnswers(storage)).toEqual(answered({ otherLanguage: false }));
    storage.setItem(ANSWERS_KEY, JSON.stringify({ topics: [], place: "", otherLanguage: false, language: "Welsh" }));
    expect(readAnswers(storage).language).toBeUndefined();
    storage.setItem(ANSWERS_KEY, JSON.stringify({ topics: [], place: "", language: "Welsh" }));
    expect(readAnswers(storage).language).toBeUndefined();
  });

  it("drops anything that isn't an answer", () => {
    const storage = memory();
    storage.setItem(
      ANSWERS_KEY,
      JSON.stringify({ urgency: "soon", who: 3, topics: ["Anxiety", "Nonsense", "Anxiety", 7], place: 4, otherLanguage: "yes", language: "English", stepFree: "yes" }),
    );
    expect(readAnswers(storage)).toEqual({ topics: ["Anxiety"], place: "" });
  });

  it("starts afresh from nothing kept, a broken record or no store", () => {
    const storage = memory();
    expect(readAnswers(storage)).toEqual(NO_ANSWERS);
    storage.setItem(ANSWERS_KEY, "{");
    expect(readAnswers(storage)).toEqual(NO_ANSWERS);
    expect(readAnswers(null)).toEqual(NO_ANSWERS);
  });
});
