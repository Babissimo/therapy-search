// @vitest-environment jsdom
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { TherapistCard } from "@shared/types";
import { STATUS_ICON, STATUS_LABEL } from "@/shortlist/status";
import type { Status } from "@/shortlist/store";
import { centreIcon, pinIcon } from "./pinIcon";

const card = (slug: string, extra: Partial<TherapistCard> = {}): TherapistCard => ({ slug, name: slug, initials: slug.toUpperCase(), tags: [], ...extra });
const html = (therapists: TherapistCard[], shortlisted?: string[]) => pinIcon(therapists, new Set(shortlisted)).options.html as HTMLElement;
const badged = (root: HTMLElement) => root.querySelector('[title="On your shortlist"]') !== null;
const marked = (therapists: TherapistCard[], statuses: [string, Status][]) => pinIcon(therapists, undefined, new Map(statuses)).options.html as HTMLElement;
const classes = (element: Element | null | undefined) => element?.className.split(" ") ?? [];

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

  it("marks each avatar shown, and nothing else, for the ring index.css draws behind a marked pin", () => {
    expect(html([card("jo")]).querySelectorAll(".pin-avatar")).toHaveLength(1);
    const stack = html(["ab", "cd", "ef", "gh"].map((slug) => card(slug)));
    expect([...stack.querySelectorAll(".pin-avatar")].map((a) => a.textContent)).toEqual(["AB", "CD", "EF"]);
  });

  it("names a stacked pin's marker by how many therapists are on it", () => {
    const root = html(["ab", "cd", "ef", "gh"].map((slug) => card(slug)));
    expect(root.getAttribute("role")).toBe("img");
    expect(root.getAttribute("aria-label")).toBe("4 therapists here");
  });

  it("badges a shortlisted therapist's pin and names it so", () => {
    const root = html([card("jo", { name: "Jo Cole", sessionTypes: "Remote" })], ["jo"]);
    expect(badged(root)).toBe(true);
    expect(root.getAttribute("aria-label")).toBe("Jo Cole, remote sessions only, on your shortlist");
    expect(badged(html([card("jo")], ["al"]))).toBe(false);
  });

  it("leads a stack with its shortlisted therapists, badges it, and counts them in its name", () => {
    const root = html(["ab", "cd", "ef", "gh"].map((slug) => card(slug)), ["gh", "cd"]);
    expect([...root.querySelectorAll(".pin-avatar")].map((a) => a.textContent)).toEqual(["CD", "GH", "AB"]);
    expect(badged(root)).toBe(true);
    expect(root.getAttribute("aria-label")).toBe("4 therapists here, 2 on your shortlist");
    expect(badged(html(["ab", "cd"].map((slug) => card(slug))))).toBe(false);
  });

  it.each([
    ["maybe", "Maybe", "maybe"],
    ["contacted", "Contacted", "contacted"],
    ["waiting", "Waiting list", "waiting list"],
    ["consultation", "Consultation", "consultation"],
    ["seeing", "Seeing them", "seeing them"],
    ["setAside", "Set aside", "set aside"],
  ] as const)("badges a therapist marked %s at the avatar's bottom left, and names the pin so", (status, title, said) => {
    const root = marked([card("jo", { name: "Jo Cole" })], [["jo", status]]);
    const badge = root.querySelector(`[title="${title}"]`);
    expect(classes(badge)).toEqual(expect.arrayContaining(["-bottom-1", "-left-1"]));
    expect(badge?.querySelector("svg")).not.toBeNull();
    expect(root.getAttribute("aria-label")).toBe(`Jo Cole, ${said}`);
  });

  it.each(["maybe", "contacted", "waiting", "consultation", "seeing", "setAside"] as const)("draws %s with the icon the cards show for it", (status) => {
    const lucide = document.createElement("div");
    lucide.innerHTML = renderToStaticMarkup(createElement(STATUS_ICON[status]));
    const drawn = marked([card("jo")], [["jo", status]]).querySelector(`[title="${STATUS_LABEL[status]}"] svg`);
    expect(drawn?.innerHTML).toBe(lucide.querySelector("svg")!.innerHTML);
  });

  it("badges no status for To contact, nor for a therapist the statuses don't name", () => {
    const toContact = marked([card("jo", { name: "Jo Cole" })], [["jo", "toContact"]]);
    expect(toContact.querySelectorAll("[title]")).toHaveLength(0);
    expect(toContact.getAttribute("aria-label")).toBe("Jo Cole");
    const other = marked([card("jo", { name: "Jo Cole" })], [["al", "contacted"]]);
    expect(other.querySelectorAll("[title]")).toHaveLength(0);
    expect(other.getAttribute("aria-label")).toBe("Jo Cole");
  });

  it("keeps the remote badge at the bottom right beside a status", () => {
    const root = marked([card("jo", { name: "Jo Cole", sessionTypes: "Remote" })], [["jo", "contacted"]]);
    expect(classes(root.querySelector('[title="Remote sessions only"]'))).toEqual(expect.arrayContaining(["-bottom-1", "-right-1"]));
    expect(root.querySelector('[title="Contacted"]')).not.toBeNull();
    expect(root.getAttribute("aria-label")).toBe("Jo Cole, remote sessions only, contacted");
  });

  it("badges no status on a stack, whose avatars overlap too closely for one each", () => {
    const root = marked([card("ab"), card("cd")], [["ab", "contacted"], ["cd", "seeing"]]);
    expect(root.querySelector('[title="Contacted"], [title="Seeing them"]')).toBeNull();
    expect(root.getAttribute("aria-label")).toBe("2 therapists here");
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
