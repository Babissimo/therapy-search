// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router";
import { describe, expect, it } from "vitest";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Masthead } from "./Masthead";

function Url() {
  const location = useLocation();
  const background = (location.state as { background?: { pathname: string } } | null)?.background;
  return <output data-testid="url">{location.pathname + (background ? ` over ${background.pathname}` : "")}</output>;
}

const at = (path: string) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <TooltipProvider>
        <Masthead />
        <Url />
      </TooltipProvider>
    </MemoryRouter>,
  );

describe("Masthead", () => {
  it("heads the page with the site's name, which links nowhere, and the way to About beside it", () => {
    at("/");
    expect(screen.getByRole("heading", { level: 1, name: "Find a UKCP therapist" })).toBeTruthy();
    const about = screen.getByRole("link", { name: "About this site" });
    expect(screen.getAllByRole("link")).toEqual([about]);
    expect(about.getAttribute("href")).toBe("/about");
    expect(about.hasAttribute("aria-current")).toBe(false);
  });

  it("opens About over the page it heads", () => {
    at("/accessibility");
    fireEvent.click(screen.getByRole("link", { name: "About this site" }));
    expect(screen.getByTestId("url").textContent).toBe("/about over /accessibility");
  });
});
