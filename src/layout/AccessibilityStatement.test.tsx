// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AccessibilityStatement, KNOWN_PROBLEMS } from "./AccessibilityStatement";

const section = (name: string) => screen.getByRole("heading", { level: 2, name }).closest("section")!;

/** The statement as the visit's first page, or as the page after another, reached by a link or not. */
function renderStatement(after?: string, followed?: boolean) {
  const entries = after === undefined ? ["/accessibility"] : [after, "/accessibility"];
  render(
    <MemoryRouter initialEntries={entries} initialIndex={entries.length - 1}>
      <AccessibilityStatement followed={followed} />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.spyOn(window, "scrollTo").mockImplementation(() => {});
});

afterEach(() => vi.restoreAllMocks());

describe("AccessibilityStatement", () => {
  it("names the page after itself, under the site's name", () => {
    renderStatement();
    expect(screen.getByRole("heading", { level: 1, name: "Accessibility statement" })).toBeTruthy();
    expect(document.title).toBe("Accessibility statement - Find a UKCP therapist (unofficial)");
  });

  it("leads to a search from a visit that begins here, leaving the keyboard at the top", () => {
    renderStatement();
    expect(screen.getByRole("link", { name: "Search for a therapist" }).getAttribute("href")).toBe("/");
    expect(document.activeElement).toBe(document.body);
    expect(window.scrollTo).not.toHaveBeenCalled();
  });

  it("leads back from a page that linked here, and takes the keyboard to its heading", () => {
    renderStatement("/?Location=Leeds", true);
    expect(screen.getByRole("button", { name: "Back" })).toBeTruthy();
    expect(document.activeElement).toBe(screen.getByRole("heading", { level: 1, name: "Accessibility statement" }));
    expect(window.scrollTo).toHaveBeenCalledWith({ top: 0 });
  });

  it("leaves the keyboard at the top when Back or a reload lands here", () => {
    renderStatement("/?Location=Leeds");
    expect(screen.getByRole("button", { name: "Back" })).toBeTruthy();
    expect(document.activeElement).toBe(document.body);
  });

  it("lists every known problem under what doesn't work well yet", () => {
    renderStatement();
    expect(within(section("What doesn't work well yet")).getAllByRole("listitem")).toHaveLength(KNOWN_PROBLEMS.length);
  });

  it("says older browsers and those without JavaScript get the plain search, and links to it", () => {
    renderStatement();
    expect(screen.getByText("search without JavaScript, or in an older browser, with a plain search")).toBeTruthy();
    const plain = within(section("What doesn't work well yet")).getByRole("link", { name: "plain search" });
    expect([plain.getAttribute("href"), plain.closest("li")?.textContent]).toEqual(["/plain", expect.stringContaining("which has no map, shortlist or notes")]);
  });

  it("says how to report a problem, that reports are public, and where else to find a therapist meanwhile", () => {
    renderStatement();
    const reporting = section("Reporting a problem");
    const report = within(reporting).getByRole("link", { name: "Report a problem on GitHub" });
    expect(report.getAttribute("href")).toBe("https://github.com/Babissimo/therapy-search/issues/new?template=accessibility.yml");
    expect(reporting.textContent).toContain("What you write there is public, and shows your GitHub name, so please leave out anything personal");
    const ukcp = within(reporting).getByRole("link", { name: "find a therapist on the UKCP website" });
    expect(ukcp.getAttribute("href")).toBe("https://www.psychotherapy.org.uk/find-a-therapist/");
  });

  it("says when and how the site was tested, and which assistive technology it hasn't been tried with", () => {
    renderStatement();
    const tested = section("How we tested it").textContent;
    expect(tested).toContain("On 1 October 2026");
    expect(tested).toContain("WCAG) 2.2, at level AA");
    expect(tested).toMatch(/haven't yet tested the site with people who use screen readers/);
    expect(screen.getByText("This statement was prepared on 1 October 2026.")).toBeTruthy();
  });

  it("keeps the names of browsers and assistive technology from machine translation", () => {
    renderStatement();
    const kept = [...document.querySelectorAll('[translate="no"]')].map((name) => name.textContent);
    expect(kept).toEqual(expect.arrayContaining(["JAWS", "NVDA", "VoiceOver", "TalkBack", "Dragon", "Safari", "Windows", "GitHub"]));
  });
});
