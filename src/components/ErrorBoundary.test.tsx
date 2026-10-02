// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { emptyParams, UKCP_ORIGIN } from "@shared/query";
import { HelpNow } from "@/layout/HelpNow";
import { UNREADABLE } from "@/lib/api";
import { NEW_TAB } from "@/lib/newTab";
import { SITE_NAME } from "@/lib/useTitle";
import { NO_PLACE } from "@/search/SearchBox";
import { REPORT_URL } from "@/site";
import * as plain from "../../worker/plain/pages";
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

  it("says what went wrong in place of a blank page, with a reload, UKCP's own directory and a way to report it", () => {
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
    const report = screen.getByRole("link", { name: "report a problem" });
    expect(report.getAttribute("href")).toBe("https://github.com/Babissimo/therapy-search/issues/new?template=accessibility.yml");
  });

  it("names the site, UKCP's directory and where to report a problem as index.html's own page does, before the script draws one", () => {
    expect(indexHtml).toContain(`<title>${SITE_NAME}</title>`);
    expect(indexHtml).toContain(`<h1>${SITE_NAME}</h1>`);
    expect(indexHtml).toContain(`href="${UKCP_ORIGIN}/find-a-therapist/"`);
    expect(indexHtml).toContain(`href="${REPORT_URL}"`);
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

describe("the plain search's pages", () => {
  const page = () => new DOMParser().parseFromString(String(plain.searchPage({ online: false, params: emptyParams(), shown: 0 })), "text/html");

  it("say where to turn for help today in HelpNow's words", () => {
    expect(helpLine(page())).toEqual(helpLine(render(<HelpNow />).container));
  });

  it("name the site, UKCP's directory and where to report a problem, and say what the app says, in the app's words", () => {
    expect([plain.SITE_NAME, plain.REPORT_URL, plain.NEW_TAB, plain.NO_PLACE, plain.UNREADABLE]).toEqual([SITE_NAME, REPORT_URL, NEW_TAB, NO_PLACE, UNREADABLE]);
    expect(page().querySelector(`a[href="${UKCP_ORIGIN}/find-a-therapist/"]`)?.textContent).toBe("find a therapist on the UKCP website");
  });
});
