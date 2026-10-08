import { describe, expect, it } from "vitest";
import { emptyParams, type SearchParams } from "@shared/query";
import type { Profile } from "@shared/types";
import { CHILD_KEY, CRISIS_KEY, mentionsOf } from "./mentions";
import { asksFee, firstName, writeEmail } from "./message";

function search(change: (params: SearchParams) => void): SearchParams {
  const params = emptyParams();
  change(params);
  return params;
}

const NONE = new Set<string>();

type Source = Parameters<typeof writeEmail>[0];

/** The message for a search, to a therapist called Jo, asking no fee and signed by no one unless the source says otherwise. */
function messageFor(change: (params: SearchParams) => void, source: Partial<Source> = {}): string {
  const mentions = mentionsOf(search(change));
  return writeEmail({ therapist: "Jo", mentions, unticked: NONE, asksFee: false, sender: {}, ...source }).message;
}

describe("writeEmail", () => {
  it("writes the fixed parts alone for a search with nothing to mention, asking the fee, signed by no one", () => {
    const written = writeEmail({ therapist: "Jo Bloggs", mentions: [], unticked: NONE, asksFee: true, sender: {} });
    expect(written.subject).toBe("Enquiry about therapy");
    expect(written.message).toBe(
      [
        "Hello Jo,",
        "I found your profile on the UKCP register and I'm looking for a therapist.",
        "Could you let me know whether you have space for new clients, what your fees are and whether you offer a first consultation?",
        "Many thanks,",
      ].join("\n\n"),
    );
    expect(written.crisis).toBe(false);
  });

  it("writes every mention into its sentence, with when the visitor is free and their name", () => {
    const mentions = mentionsOf(
      search((p) => {
        p.multi.WorksWith = ["Individuals"];
        p.multi.HelpWithAdvanced = ["Anxiety", "Depression", "Stress"];
        p.text.HelpWith = "EMDR";
        p.multi.TypesOfTherapy = ["Psychodynamic Psychotherapist"];
        p.multi.TypesOfSession = ["Face to Face - Long Term", "Online Therapy"];
        p.multi.Languages = ["Polish"];
        p.text.Location = "Leeds";
        p.flags.OnlyWheelchairAccessible = true;
      }),
    );
    const sender = { name: " Sam ", free: "weekday evenings." };
    const { message } = writeEmail({ therapist: "Jo Anne Bloggs", mentions, unticked: NONE, asksFee: false, sender });
    expect(message).toBe(
      [
        "Hello Jo,",
        "I found your profile on the UKCP register and I'm looking for a therapist for myself. I'd like some help with anxiety, depression and stress. " +
          "I'm particularly interested in EMDR, and in working with a Psychodynamic Psychotherapist.",
        "I'd like to have sessions in person or online, for longer-term work, and in Polish. I live near Leeds. I'm usually free weekday evenings.",
        "Could you let me know whether you have space for new clients, whether your room is wheelchair accessible and whether you offer a first consultation?",
        "Many thanks,\nSam",
      ].join("\n\n"),
    );
  });

  it("leaves out what is unticked, with its sentence where nothing in it is left", () => {
    const mentions = mentionsOf(
      search((p) => {
        p.multi.HelpWithAdvanced = ["Anxiety", "Depression"];
        p.multi.Languages = ["Polish"];
      }),
    );
    const unticked = new Set(["help:depression", "language:Polish"]);
    const { message } = writeEmail({ therapist: "Jo", mentions, unticked, asksFee: false, sender: {} });
    expect(message).toContain("I'd like some help with anxiety.");
    expect(message).not.toContain("Polish");
    expect(message).not.toContain("I'd like to");
  });

  it("writes the fixed parts alone once everything is unticked", () => {
    const params = search((p) => {
      p.multi.WorksWith = ["Individuals", "Private healthcare referrals"];
      p.multi.HelpWithAdvanced = ["Anxiety"];
      p.text.HelpWith = "EMDR";
      p.multi.TypesOfTherapy = ["Gestalt Psychotherapist"];
      p.multi.TypesOfSession = ["Face to Face - Long Term", "Online Therapy"];
      p.multi.Languages = ["Polish"];
      p.text.Location = "Leeds";
      p.flags.OnlyWheelchairAccessible = true;
    });
    const mentions = mentionsOf(params);
    const unticked = new Set(mentions.map((mention) => mention.key));
    const rest = { therapist: "Jo", asksFee: true, sender: { name: "Sam" } };
    expect(writeEmail({ ...rest, mentions, unticked }).message).toBe(writeEmail({ ...rest, mentions: [], unticked: NONE }).message);
  });

  it("joins several people the help is for", () => {
    const message = messageFor((p) => (p.multi.WorksWith = ["Individuals", "Couples", "Families"]));
    expect(message).toContain("I'm looking for a therapist for myself, couples therapy with my partner and family therapy.");
  });

  it("makes the help a child's where the child is the only person ticked", () => {
    const child = "Children and young people";
    const helpFor = (who: string[], unticked: string[] = []) =>
      messageFor(
        (p) => {
          p.multi.WorksWith = who;
          p.multi.HelpWithAdvanced = ["Anxiety", "Stress"];
        },
        { unticked: new Set(unticked) },
      );
    expect(helpFor([child])).toContain("I'm looking for a therapist for my child. I'd like some help for my child with anxiety and stress.");
    expect(helpFor([child, "Individuals"], ["who:Individuals"])).toContain("I'd like some help for my child with anxiety and stress.");
    expect(helpFor([child, "Individuals"])).toContain("I'd like some help with anxiety and stress.");
    expect(helpFor([child], [CHILD_KEY])).toContain("I'd like some help with anxiety and stress.");
    expect(helpFor([])).toContain("I'd like some help with anxiety and stress.");
  });

  it("says an approach without a type of therapy, and a type without an approach", () => {
    const approach = messageFor((p) => (p.text.HelpWith = "EMDR"));
    expect(approach).toContain("I'm particularly interested in EMDR.");
    expect(approach).not.toContain("working with");
    const type = messageFor((p) => (p.multi.TypesOfTherapy = ["Gestalt Psychotherapist"]));
    expect(type).toContain("I'm particularly interested in working with a Gestalt Psychotherapist.");
    expect(type).not.toContain("and in");
  });

  it("has sessions by the ways of meeting, with the term of the work and the languages after them", () => {
    const by = (sessions: string[], languages: string[] = []) => (p: SearchParams) => {
      p.multi.TypesOfSession = sessions;
      p.multi.Languages = languages;
    };
    expect(messageFor(by(["Telephone Therapy"]))).toContain("\n\nI'd like to have sessions by phone.\n\n");
    expect(messageFor(by(["Telephone Therapy"], ["Polish", "Russian"]))).toContain("I'd like to have sessions by phone and in Polish or Russian.");
    expect(messageFor(by(["Online Therapy", "Home Visits"], ["Polish"]))).toContain("I'd like to have sessions at home or online and in Polish.");
    expect(messageFor(by(["Face to Face - Short Term", "Home Visits"], ["Polish"]))).toContain(
      "I'd like to have sessions in person or at home, for short-term work, and in Polish.",
    );
    expect(messageFor(by([], ["Polish"]))).toContain("\n\nI'd like to have sessions in Polish.\n\n");
  });

  it("drops the term of the work along with in person", () => {
    const change = (p: SearchParams) => (p.multi.TypesOfSession = ["Face to Face - Long Term", "Online Therapy"]);
    expect(messageFor(change)).toContain("I'd like to have sessions in person or online, for longer-term work.");
    const message = messageFor(change, { unticked: new Set(["how:inPerson"]) });
    expect(message).toContain("I'd like to have sessions online.");
    expect(message).not.toContain("longer-term");
  });

  it("words the terms that don't read after 'help with'", () => {
    const message = messageFor((p) => {
      p.multi.HelpWithAdvanced = ["Gender", "Transgender", "Family", "Supervision", "Training", "Private Practice Issues"];
    });
    expect(message).toContain(
      "I'd like some help with gender identity, family issues, clinical supervision, my training as a therapist and running a private practice.",
    );
  });

  it("says languages without a way of meeting, and asks about insurance", () => {
    const mentions = mentionsOf(
      search((p) => {
        p.multi.Languages = ["Polish", "Russian"];
        p.multi.WorksWith = ["Private healthcare referrals"];
      }),
    );
    const { message } = writeEmail({ therapist: "Jo", mentions, unticked: NONE, asksFee: true, sender: {} });
    expect(message).toContain("I'd like to have sessions in Polish or Russian.");
    expect(message).toContain(
      "what your fees are, whether you accept clients through private health insurance and whether you offer a first consultation?",
    );
  });

  it("asks only the two fixed questions where nothing else is asked", () => {
    const ask = "Could you let me know whether you have space for new clients and whether you offer a first consultation?";
    expect(messageFor(() => {})).toContain(ask);
  });

  it("writes a place and when the visitor is free without a way of meeting, no line left empty", () => {
    const message = messageFor((p) => (p.text.Location = "LS6 1AA"), { sender: { free: " Saturdays " } });
    expect(message).toContain("\n\nI live in the LS6 area. I'm usually free Saturdays.\n\n");
    expect(message).not.toContain("I'd like to");
    expect(message).not.toMatch(/ {2}|\n{3}| \n|\. \./);
  });

  it("ends the time the visitor is free with one full stop, keeping its case", () => {
    const free = (typed: string) => messageFor(() => {}, { sender: { free: typed } });
    const typings = ["Tuesdays", "Tuesdays.", "Tuesdays!", "Tuesdays?", "Tuesdays,", "Tuesdays;", "Tuesdays:", "  Tuesdays ?! ", "Tuesdays . , "];
    for (const typed of typings) {
      expect(free(typed), JSON.stringify(typed)).toContain("\n\nI'm usually free Tuesdays.\n\n");
    }
  });

  it("leaves out a name or free time that is only white space or marks", () => {
    const { message } = writeEmail({ therapist: "Jo", mentions: [], unticked: NONE, asksFee: false, sender: { name: "  ", free: " . " } });
    expect(message).not.toContain("free");
    expect(message.endsWith("\n\nMany thanks,")).toBe(true);
    expect(messageFor(() => {}, { sender: { free: " ?! " } })).not.toContain("free");
  });

  it("greets a therapist whose name begins with a title by that title and their surname", () => {
    expect(messageFor(() => {}, { therapist: "Dr Jo Bloggs" })).toMatch(/^Hello Dr Bloggs,\n\n/);
    expect(messageFor(() => {}, { therapist: "Jo Bloggs" })).toMatch(/^Hello Jo,\n\n/);
  });

  it("flags a message that mentions suicidal thoughts, while that is ticked", () => {
    const mentions = mentionsOf(search((p) => (p.multi.HelpWithAdvanced = ["Suicide"])));
    expect(writeEmail({ therapist: "Jo", mentions, unticked: NONE, asksFee: true, sender: {} }).crisis).toBe(true);
    expect(writeEmail({ therapist: "Jo", mentions, unticked: new Set([CRISIS_KEY]), asksFee: true, sender: {} }).crisis).toBe(false);
  });
});

describe("firstName", () => {
  it("is the first word of the name", () => {
    expect(firstName("Nicola Jane Hammatt")).toBe("Nicola");
    expect(firstName(" Jo ")).toBe("Jo");
    expect(firstName("Drew Smith")).toBe("Drew");
    expect(firstName("Missy Elliott")).toBe("Missy");
  });

  it("is a title as written and the last word of a name that begins with one, whatever its case or full stop", () => {
    expect(firstName("Dr Jo Bloggs")).toBe("Dr Bloggs");
    expect(firstName(" Dr. Jo  Anne Bloggs ")).toBe("Dr Bloggs");
    expect(firstName("prof. Jo Bloggs-Smith")).toBe("prof Bloggs-Smith");
    for (const title of ["Professor", "Mr", "Mrs", "Ms", "Miss", "Mx", "Rev", "Revd", "DR"]) {
      expect(firstName(`${title} Jo Bloggs`)).toBe(`${title} Bloggs`);
    }
  });

  it("is the title alone where there is no more to the name", () => {
    expect(firstName("Dr")).toBe("Dr");
  });
});

describe("asksFee", () => {
  const profile = (costs: (string | undefined)[]): Profile => ({
    slug: "Jo-ABCDEFGH",
    name: "Jo",
    initials: "J",
    languages: [],
    emailInContact: false,
    social: [],
    about: [],
    practical: [],
    offices: costs.map((cost, index) => ({ name: `Office ${index + 1}`, isMain: index === 0, address: [], cost })),
  });

  it("asks only where no office shows a fee, or there is no profile to say", () => {
    expect(asksFee(profile(["£60 per session"]))).toBe(false);
    expect(asksFee(profile([undefined]))).toBe(true);
    expect(asksFee(undefined)).toBe(true);
  });

  it("does not ask where any one of several offices shows a fee", () => {
    expect(asksFee(profile([undefined, "£60 per session"]))).toBe(false);
    expect(asksFee(profile(["£60 per session", undefined]))).toBe(false);
    expect(asksFee(profile([undefined, undefined]))).toBe(true);
  });
});
