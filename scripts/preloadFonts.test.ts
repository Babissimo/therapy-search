import { describe, expect, it } from "vitest";
import { latinFonts } from "./preloadFonts";

describe("latinFonts", () => {
  it("picks each font's Latin set, leaving the extended and other scripts' sets to load when a name needs them", () => {
    const built = [
      "assets/atkinson-hyperlegible-next-latin-ext-wght-normal-C6vrW8VD.woff2",
      "assets/atkinson-hyperlegible-next-latin-wght-normal-BcXVPD7q.woff2",
      "assets/newsreader-latin-ext-opsz-normal-BQn1nviT.woff2",
      "assets/newsreader-latin-opsz-normal-s-izfB6B.woff2",
      "assets/newsreader-vietnamese-opsz-normal-BjhtXyW2.woff2",
      "assets/index-D8-uS7q0.css",
      "index.html",
    ];
    expect(latinFonts(built)).toEqual([
      "assets/atkinson-hyperlegible-next-latin-wght-normal-BcXVPD7q.woff2",
      "assets/newsreader-latin-opsz-normal-s-izfB6B.woff2",
    ]);
  });
});
