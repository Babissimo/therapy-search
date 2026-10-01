// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { describe, expect, it, vi } from "vitest";
import { emptyParams, type SearchParams } from "@shared/query";
import { TooltipProvider } from "@/components/ui/tooltip";
import { FilterPanel } from "./FilterPanel";
import { SearchBox } from "./SearchBox";
import { withFlag, withMulti, withText } from "./state";
import { useSearchDrafts } from "./useSearchDrafts";

function Harness({ params, onChange }: { params: SearchParams; onChange: (next: SearchParams) => void }) {
  const drafts = useSearchDrafts(params, onChange);
  return (
    <>
      <SearchBox params={params} drafts={drafts} />
      <FilterPanel params={params} drafts={drafts} />
    </>
  );
}

const panel = (params: SearchParams, onChange = vi.fn()) => (
  <MemoryRouter>
    <TooltipProvider>
      <Harness params={params} onChange={onChange} />
    </TooltipProvider>
  </MemoryRouter>
);
const location = () => screen.getByRole<HTMLInputElement>("textbox", { name: "Location" });
const keyword = () => screen.getByRole<HTMLInputElement>("searchbox", { name: "Keyword search" });

describe("SearchBox and FilterPanel", () => {
  it("search with the typed location and keyword together", () => {
    const onChange = vi.fn();
    render(panel(emptyParams(), onChange));
    fireEvent.change(location(), { target: { value: "Leeds" } });
    fireEvent.change(keyword(), { target: { value: "grief" } });
    fireEvent.click(screen.getByRole("button", { name: "Search" }));
    expect(onChange).toHaveBeenCalledOnce();
    expect(onChange.mock.calls[0]?.[0].text).toMatchObject({ Location: "Leeds", KeywordFilter: "grief" });
  });

  it("search from the keyword box as well, still with the typed location", () => {
    const onChange = vi.fn();
    render(panel(emptyParams(), onChange));
    fireEvent.change(location(), { target: { value: "York" } });
    fireEvent.change(keyword(), { target: { value: "anxiety" } });
    fireEvent.submit(keyword().form!);
    expect(onChange.mock.calls[0]?.[0].text).toMatchObject({ Location: "York", KeywordFilter: "anxiety" });
  });

  it("hold ticks, the outside-UK tick among them, until the box searches them with the typed location", () => {
    const onChange = vi.fn();
    render(panel(emptyParams(), onChange));
    fireEvent.change(location(), { target: { value: "Paris" } });
    fireEvent.click(screen.getByRole("button", { name: "More filters" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Search locations outside the UK" }));
    fireEvent.click(screen.getByRole("button", { name: "Languages" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "French" }));
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByRole("checkbox", { name: "French" }).getAttribute("aria-checked")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: "Search" }));
    expect(onChange.mock.calls[0]?.[0]).toMatchObject({ flags: { LocationSearchOutsideUK: true }, multi: { Languages: ["French"] }, text: { Location: "Paris" } });
  });

  it("mark each box ticked or unticked since the search on show, and count a group's ticks as they stand", () => {
    const { container } = render(panel(withMulti(emptyParams(), "Languages", "German", true)));
    fireEvent.click(screen.getByRole("checkbox", { name: "German" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "French" }));
    expect(container.querySelectorAll("[data-unsearched]")).toHaveLength(2);
    screen.getByRole("button", { name: "Languages, 1 ticked" });
    fireEvent.click(screen.getByRole("checkbox", { name: "German" }));
    expect(container.querySelectorAll("[data-unsearched]")).toHaveLength(1);
  });

  it("list the outside-UK tick among the additional filters, which start open when it is ticked", () => {
    render(panel(withFlag(emptyParams(), "LocationSearchOutsideUK", true)));
    expect(screen.getByRole("button", { name: "More filters, 1 ticked" }).getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByRole("checkbox", { name: "Search locations outside the UK" }).getAttribute("aria-checked")).toBe("true");
  });

  it("clear every filter for the next search, keeping the typed location and whether it is outside the UK", () => {
    const onChange = vi.fn();
    const params = withFlag(withMulti(withText(emptyParams(), "KeywordFilter", "grief"), "Languages", "French", true), "LocationSearchOutsideUK", true);
    render(panel(params, onChange));
    fireEvent.change(location(), { target: { value: "Paris" } });
    fireEvent.click(screen.getByRole("button", { name: "Clear all filters" }));
    expect(onChange).not.toHaveBeenCalled();
    expect(keyword().value).toBe("");
    fireEvent.click(screen.getByRole("button", { name: "Search" }));
    const outsideParis = withFlag(withText(emptyParams(), "Location", "Paris"), "LocationSearchOutsideUK", true);
    expect(onChange).toHaveBeenCalledWith(outsideParis);
  });

  it("keep a typed location until the search's own location changes", () => {
    const { rerender } = render(panel(withText(emptyParams(), "KeywordFilter", "grief")));
    fireEvent.change(location(), { target: { value: "Bristol" } });
    rerender(panel(emptyParams()));
    expect(location().value).toBe("Bristol");
    rerender(panel(withText(emptyParams(), "Location", "Leeds")));
    expect(location().value).toBe("Leeds");
  });
});
