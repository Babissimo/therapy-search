// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { UKCP_ORIGIN } from "@shared/query";
import { SITE_NAME } from "@/lib/useTitle";
import indexHtml from "../../index.html?raw";
import { ErrorBoundary } from "./ErrorBoundary";

function Broken(): never {
  throw new Error("A page that can't be drawn");
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
});
