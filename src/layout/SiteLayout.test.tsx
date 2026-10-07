// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { describe, expect, it } from "vitest";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SiteLayout } from "./SiteLayout";

const at = (path: string | { pathname: string; state: unknown }) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <TooltipProvider>
        <SiteLayout>
          <p>Page</p>
        </SiteLayout>
      </TooltipProvider>
    </MemoryRouter>,
  );

describe("SiteLayout", () => {
  it("opens a document page with the site's name, the way to About and the theme switch", () => {
    at("/therapist/Jo-ABCDEFGH");
    const header = screen.getByRole("banner");
    expect(within(header).getByText("Find a UKCP therapist")).toBeTruthy();
    expect(within(header).getByRole("link", { name: "About this site" })).toBeTruthy();
    expect(within(header).getByRole("group", { name: "Theme" })).toBeTruthy();
    expect(header.compareDocumentPosition(screen.getByText("Page")) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // The page's own heading is its h1.
    expect(screen.queryByRole("heading", { name: "Find a UKCP therapist" })).toBeNull();
  });

  it("leaves the search page's name and theme switch to its results", () => {
    at("/?Location=Leeds");
    expect(screen.queryByRole("banner")).toBeNull();
  });

  it("keeps the search page's layout beneath a profile opened over it", () => {
    at({ pathname: "/therapist/Jo-ABCDEFGH", state: { background: { pathname: "/", search: "?Location=Leeds" } } });
    expect(screen.queryByRole("banner")).toBeNull();
  });

  it("lays the online search out as the search page, beneath a profile opened over it too", () => {
    at("/online");
    expect(screen.queryByRole("banner")).toBeNull();
    at({ pathname: "/therapist/Jo-ABCDEFGH", state: { background: { pathname: "/online", search: "" } } });
    expect(screen.queryByRole("banner")).toBeNull();
  });
});
