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
import mainSource from "../main.tsx?raw";
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

  it("says what went wrong in place of a blank page, with a reload, the plain search, UKCP's own directory and a way to report it", () => {
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
    expect(screen.getByRole("link", { name: "plain search" }).getAttribute("href")).toBe("/plain");
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

describe("index.html's page", () => {
  const page = () => new DOMParser().parseFromString(indexHtml, "text/html");
  const gate = [...page().querySelectorAll("head script")].map((script) => script.textContent ?? "").find((text) => text.includes("old-browser"))!;

  type Browser = { CSS?: { supports?: (property: string, value: string) => boolean }; matchMedia?: (query: string) => { matches: boolean }; CSSPropertyRule?: unknown };

  /** Whether the gate marks a browser offering these, run as the browser would run it. */
  function marked(window: Browser, { toSorted = true } = {}): boolean {
    const documentElement = { className: "dark" };
    const own = Object.getOwnPropertyDescriptor(Array.prototype, "toSorted")!;
    if (!toSorted) delete (Array.prototype as { toSorted?: unknown }).toSorted;
    try {
      new Function("window", "document", gate)(window, { documentElement });
    } finally {
      Object.defineProperty(Array.prototype, "toSorted", own);
    }
    return documentElement.className.split(" ").includes("old-browser");
  }

  /** A browser with oklch and media query ranges as asked, and @property unless told otherwise. */
  function browser({ oklch = true, ranges = true, property = true } = {}): Browser {
    return {
      CSS: { supports: (name, value) => name === "color" && value === "oklch(0 0 0)" && oklch },
      matchMedia: (query) => ({ matches: query === "(width >= 0px)" && ranges }),
      ...(property && { CSSPropertyRule: class {} }),
    };
  }

  it("offers the plain search without JavaScript, when the app is late, and in a browser too old for it", () => {
    for (const where of [".fallback noscript", ".fallback .late", ".fallback .old"]) {
      expect([where, page().querySelector(where)?.innerHTML]).toEqual([where, expect.stringContaining('<a href="/plain">plain search</a>')]);
    }
  });

  it("marks a browser below the build's floor, and leaves one at it or above", () => {
    expect(marked(browser())).toBe(false);
    // Firefox 115 to 127, which lack @property: Tailwind sets its variables' starting values itself.
    expect(marked(browser({ property: false }))).toBe(false);
    expect(marked(browser({ oklch: false }))).toBe(true); // Chrome 110
    expect(marked(browser({ ranges: false }))).toBe(true); // Safari 16.3
    expect(marked(browser(), { toSorted: false })).toBe(true); // Firefox 114
    expect(marked({ ...browser(), CSS: {} })).toBe(true);
    expect(marked({ ...browser(), matchMedia: undefined })).toBe(true);
    expect(marked({})).toBe(true);
  });

  it("writes the gate for browsers older than any the build reaches, and starts the app only where it doesn't mark one", () => {
    expect(gate).not.toMatch(/\b(let|const|class)\b|=>|`|\?\.|\?\?/);
    expect(mainSource).toContain('if (!document.documentElement.classList.contains("old-browser"))');
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
