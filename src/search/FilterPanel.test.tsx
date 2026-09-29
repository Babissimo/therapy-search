// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { describe, expect, it, vi } from "vitest";
import { emptyParams, type SearchParams } from "@shared/query";
import { TooltipProvider } from "@/components/ui/tooltip";
import { FilterPanel } from "./FilterPanel";
import { withText } from "./state";

const panel = (params: SearchParams, onChange = vi.fn()) => (
  <MemoryRouter>
    <TooltipProvider>
      <FilterPanel params={params} onChange={onChange} />
    </TooltipProvider>
  </MemoryRouter>
);
const location = () => screen.getByRole<HTMLInputElement>("textbox", { name: "Location" });

describe("FilterPanel", () => {
  it("searches with the typed location and keyword together", () => {
    const onChange = vi.fn();
    render(panel(emptyParams(), onChange));
    fireEvent.change(location(), { target: { value: "Leeds" } });
    fireEvent.change(screen.getByRole("searchbox", { name: "Keyword search" }), { target: { value: "grief" } });
    fireEvent.click(screen.getByRole("button", { name: "Search" }));
    expect(onChange).toHaveBeenCalledOnce();
    expect(onChange.mock.calls[0]?.[0].text).toMatchObject({ Location: "Leeds", KeywordFilter: "grief" });
  });

  it("takes the typed location with the outside-UK tick or any other tick", () => {
    const onChange = vi.fn();
    render(panel(emptyParams(), onChange));
    fireEvent.change(location(), { target: { value: "Paris" } });
    fireEvent.click(screen.getByRole("checkbox", { name: "Search locations outside the UK" }));
    expect(onChange.mock.calls[0]?.[0]).toMatchObject({ flags: { LocationSearchOutsideUK: true }, text: { Location: "Paris" } });
    fireEvent.click(screen.getByRole("button", { name: "Languages" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "French" }));
    expect(onChange.mock.calls[1]?.[0]).toMatchObject({ multi: { Languages: ["French"] }, text: { Location: "Paris" } });
  });

  it("keeps a typed location until the search's own location changes", () => {
    const { rerender } = render(panel(withText(emptyParams(), "KeywordFilter", "grief")));
    fireEvent.change(location(), { target: { value: "Bristol" } });
    rerender(panel(emptyParams()));
    expect(location().value).toBe("Bristol");
    rerender(panel(withText(emptyParams(), "Location", "Leeds")));
    expect(location().value).toBe("Leeds");
  });
});
