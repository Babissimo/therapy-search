import { describe, expect, it } from "vitest";
import { fragmentAddress } from "./address";

const at = (href: string) => fragmentAddress(new URL(href, "https://example.test"));

describe("fragmentAddress", () => {
  it("moves a search from the query string to after the #", () => {
    expect(at("/?Location=Leeds&HelpWith=Anxiety")).toBe("/#/?Location=Leeds&HelpWith=Anxiety");
    expect(at("/online?TypesOfSession=Online+Therapy")).toBe("/#/online?TypesOfSession=Online+Therapy");
  });

  it("moves a profile's path to after the #", () => {
    expect(at("/therapist/Jo-Bloggs-ABCDEFGH")).toBe("/#/therapist/Jo-Bloggs-ABCDEFGH");
  });

  it("leaves an address with nothing before the # as it is", () => {
    expect(at("/")).toBeNull();
    expect(at("/#/?Location=Leeds")).toBeNull();
    expect(at("/#/therapist/Jo-Bloggs-ABCDEFGH")).toBeNull();
  });

  it("keeps a page already after the #, dropping what is before it", () => {
    expect(at("/?Location=Leeds#/therapist/Jo-Bloggs-ABCDEFGH")).toBe("/#/therapist/Jo-Bloggs-ABCDEFGH");
  });
});
