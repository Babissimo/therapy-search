// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import type { TherapistCard } from "@shared/types";
import { centreIcon, pinIcon } from "./pinIcon";

const card = (slug: string, extra: Partial<TherapistCard> = {}): TherapistCard => ({ slug, name: slug, initials: slug.toUpperCase(), tags: [], ...extra });
const html = (therapists: TherapistCard[]) => pinIcon(therapists).options.html as HTMLElement;

describe("pinIcon", () => {
  it("shows one therapist's photo over their initials", () => {
    const icon = pinIcon([card("jo", { photoUrl: "https://example.test/jo.jpg" })]);
    const root = icon.options.html as HTMLElement;
    expect(root.textContent).toBe("JO");
    expect(root.querySelector("img")?.getAttribute("src")).toBe("https://example.test/jo.jpg");
    expect(icon.options.iconSize).toEqual([40, 40]);
  });

  it("drops a photo that fails to load, leaving the initials", () => {
    const root = html([card("jo", { photoUrl: "https://example.test/missing.jpg" })]);
    root.querySelector("img")?.dispatchEvent(new Event("error"));
    expect(root.querySelector("img")).toBeNull();
    expect(root.textContent).toBe("JO");
  });

  it("badges a therapist who only works remotely", () => {
    expect(html([card("jo", { sessionTypes: "Remote" })]).querySelector('[title="Remote sessions only"]')).not.toBeNull();
    expect(html([card("jo", { sessionTypes: "In-person & Remote" })]).querySelector('[title="Remote sessions only"]')).toBeNull();
  });

  it("names a single pin's marker after the therapist", () => {
    const root = html([card("jo", { name: "Jo Cole" })]);
    expect(root.getAttribute("role")).toBe("img");
    expect(root.getAttribute("aria-label")).toBe("Jo Cole");
  });

  it("names a remote-only therapist's pin as such too", () => {
    const root = html([card("jo", { name: "Jo Cole", sessionTypes: "Remote" })]);
    expect(root.getAttribute("aria-label")).toBe("Jo Cole, remote sessions only");
  });

  it("stacks up to three avatars with the full count", () => {
    const icon = pinIcon(["ab", "cd", "ef", "gh"].map((slug) => card(slug)));
    expect((icon.options.html as HTMLElement).textContent).toBe("ABCDEF4");
    expect(icon.options.iconSize).toEqual([72, 32]);
  });

  it("names a stacked pin's marker by how many therapists are on it", () => {
    const root = html(["ab", "cd", "ef", "gh"].map((slug) => card(slug)));
    expect(root.getAttribute("role")).toBe("img");
    expect(root.getAttribute("aria-label")).toBe("4 therapists here");
  });
});

describe("centreIcon", () => {
  it("stands on the search's centre by its tip", () => {
    const { iconSize, iconAnchor } = centreIcon().options;
    const [width, height] = iconSize as [number, number];
    expect(iconAnchor).toEqual([width / 2, height]);
  });

  it("is hidden from assistive technology, which reads the place searched beside the results", () => {
    expect((centreIcon().options.html as HTMLElement).getAttribute("aria-hidden")).toBe("true");
  });
});
