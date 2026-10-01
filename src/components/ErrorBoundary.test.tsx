// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { UKCP_ORIGIN } from "@shared/query";
import { HelpNow } from "@/layout/HelpNow";
import { SITE_NAME } from "@/lib/useTitle";
import indexHtml from "../../index.html?raw";
import { ErrorBoundary } from "./ErrorBoundary";

function Broken(): never {
  throw new Error("A page that can't be drawn");
}

/** The help line within a page: its words as a browser shows them, the names kept from translation, and the numbers dialled. */
function helpLine(page: ParentNode) {
  const line = [...page.querySelectorAll("p")].find((p) => p.textContent?.trim().startsWith("Need help now?"));
  return {
    shownAlways: line?.closest("noscript, .loading, .late") === null,
    words: line?.textContent?.replace(/\s+/g, " ").trim(),
    untranslated: [...(line?.querySelectorAll('[translate="no"]') ?? [])].map((name) => name.textContent),
    numbers: [...(line?.querySelectorAll("a") ?? [])].map((link) => [link.textContent, link.getAttribute("href")]),
  };
}

afterEach(() => vi.restoreAllMocks());

describe("ErrorBoundary", () => {
  it("shows the page as it is when nothing goes wrong", () => {
    render(
      <ErrorBoundary>
        <p>The search</p>
      </ErrorBoundary>,
    );
    expect(screen.getByText("The search")).toBeTruthy();
  });

  it("says what went wrong in place of a blank page, with a reload and UKCP's own directory", () => {
    // React reports the error it caught to the console.
    vi.spyOn(console, "error").mockImplementation(() => {});
    render(
      <ErrorBoundary>
        <Broken />
      </ErrorBoundary>,
    );
    expect(screen.getByRole("heading", { level: 1, name: "Find a UKCP therapist (unofficial)" })).toBeTruthy();
    expect(screen.getByText("Something went wrong on this page.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Reload the page" })).toBeTruthy();
    const ukcp = screen.getByRole("link", { name: "find a therapist on the UKCP website" });
    expect(ukcp.getAttribute("href")).toBe("https://www.psychotherapy.org.uk/find-a-therapist/");
  });

  it("names the site and UKCP's directory as index.html's own page does, before the script draws one", () => {
    expect(indexHtml).toContain(`<title>${SITE_NAME}</title>`);
    expect(indexHtml).toContain(`<h1>${SITE_NAME}</h1>`);
    expect(indexHtml).toContain(`href="${UKCP_ORIGIN}/find-a-therapist/"`);
  });

  it("says where to turn for help today in HelpNow's words, when drawing fails and on index.html's page, loading or not", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const help = helpLine(render(<HelpNow />).container);
    expect(help.numbers).toHaveLength(5);
    const failed = render(
      <ErrorBoundary>
        <Broken />
      </ErrorBoundary>,
    );
    expect(helpLine(failed.container)).toEqual(help);
    expect(helpLine(new DOMParser().parseFromString(indexHtml, "text/html"))).toEqual(help);
  });
});
