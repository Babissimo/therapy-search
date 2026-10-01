// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
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
});
