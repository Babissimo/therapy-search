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
  it("closes a document page with the site's name and theme switch", () => {
    at("/therapist/Jo-ABCDEFGH");
    const footer = screen.getByRole("contentinfo");
    expect(within(footer).getByRole("button", { name: "Find a UKCP therapist" })).toBeTruthy();
    expect(within(footer).getByRole("group", { name: "Theme" })).toBeTruthy();
    // The page's own heading is its h1.
    expect(screen.queryByRole("heading", { name: "Find a UKCP therapist" })).toBeNull();
  });

  it("leaves the search page's name and theme switch to its results", () => {
    at("/?Location=Leeds");
    expect(screen.queryByRole("contentinfo")).toBeNull();
  });

  it("keeps the search page's layout beneath a profile opened over it", () => {
    at({ pathname: "/therapist/Jo-ABCDEFGH", state: { background: { pathname: "/", search: "?Location=Leeds" } } });
    expect(screen.queryByRole("contentinfo")).toBeNull();
  });
});
