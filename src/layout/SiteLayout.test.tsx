// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
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
  it("closes a document page with the disclaimer", () => {
    at("/about");
    expect(screen.getByRole("contentinfo").textContent).toContain("Not affiliated with or endorsed by UKCP");
  });

  it("leaves the search page's disclaimer to its results", () => {
    at("/?Location=Leeds");
    expect(screen.queryByRole("contentinfo")).toBeNull();
  });

  it("keeps the search page's layout beneath a profile opened over it", () => {
    at({ pathname: "/therapist/Jo-ABCDEFGH", state: { background: { pathname: "/", search: "?Location=Leeds" } } });
    expect(screen.queryByRole("contentinfo")).toBeNull();
  });
});
