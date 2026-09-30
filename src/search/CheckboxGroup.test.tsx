// @vitest-environment jsdom
import type { ReactElement } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { TooltipProvider } from "@/components/ui/tooltip";
import { CheckboxGroup } from "./CheckboxGroup";

const group = {
  label: "Languages",
  fields: ["French", "Polish", "Spanish"].map((v) => ({ name: "Languages", value: v, label: v })),
};

describe("CheckboxGroup", () => {
  it("narrows a searchable list as you type", () => {
    render(<CheckboxGroup group={group} searchable isChecked={() => false} onToggle={() => {}} />);
    fireEvent.change(screen.getByRole("searchbox", { name: "Search Languages" }), { target: { value: "pol" } });
    expect(screen.getAllByRole("checkbox")).toHaveLength(1);
    screen.getByRole("checkbox", { name: "Polish" });
  });

  it("reports the field and its new state when a box is ticked", () => {
    const onToggle = vi.fn();
    render(<CheckboxGroup group={group} searchable={false} isChecked={() => false} onToggle={onToggle} />);
    fireEvent.click(screen.getByRole("checkbox", { name: "Spanish" }));
    expect(onToggle).toHaveBeenCalledWith(group.fields[2], true);
  });

  it("warns that ticks narrow once one is ticked, for lists whose values UKCP combines", () => {
    const hint = /each extra tick narrows/;
    const { rerender } = render(<CheckboxGroup group={group} searchable={false} isChecked={() => false} onToggle={() => {}} />);
    expect(screen.queryByText(hint)).toBeNull();
    rerender(<CheckboxGroup group={group} searchable={false} isChecked={(f) => f.value === "French"} onToggle={() => {}} />);
    screen.getByText(hint);
  });

  it("leaves the hint off the session types, as UKCP lists anyone offering any of those ticked", () => {
    const sessions = { label: "Type of Session", fields: ["Online Therapy", "Telephone Therapy"].map((v) => ({ name: "TypesOfSession", value: v, label: v })) };
    render(<CheckboxGroup group={sessions} searchable={false} isChecked={() => true} onToggle={() => {}} />);
    expect(screen.queryByText(/each extra tick narrows/)).toBeNull();
  });

  it("lists boxes ticked when it opens first, and leaves later ticks where they are", () => {
    const names = () => screen.getAllByRole("checkbox").map((c) => c.parentElement?.textContent);
    const { rerender } = render(<CheckboxGroup group={group} searchable={false} isChecked={(f) => f.value === "Spanish"} onToggle={() => {}} />);
    expect(names()).toEqual(["Spanish", "French", "Polish"]);
    rerender(<CheckboxGroup group={group} searchable={false} isChecked={(f) => f.value !== "French"} onToggle={() => {}} />);
    expect(names()).toEqual(["Spanish", "French", "Polish"]);
  });

  describe("under headings", () => {
    const types = {
      label: "Type of Therapy",
      fields: ["Child Counsellor", "Gestalt Psychotherapist", "Person Centred Psychotherapist"].map((v) => ({ name: "TypesOfTherapy", value: v, label: v })),
    };
    // Headings carry question marks, whose tooltips need a provider.
    const renderWithTips = (ui: ReactElement) => render(ui, { wrapper: TooltipProvider });

    it("keeps each heading shut until it is opened", () => {
      renderWithTips(<CheckboxGroup group={types} searchable={false} isChecked={() => false} onToggle={() => {}} />);
      expect(screen.queryAllByRole("checkbox")).toHaveLength(0);
      fireEvent.click(screen.getByRole("button", { name: "Humanistic and integrative" }));
      expect(screen.getAllByRole("checkbox")).toHaveLength(2);
      screen.getByRole("checkbox", { name: "Person Centred Psychotherapist" });
    });

    it("says what a heading's titles have in common behind a question mark beside it", () => {
      renderWithTips(<CheckboxGroup group={types} searchable={false} isChecked={() => false} onToggle={() => {}} />);
      expect(screen.queryByText(/expert on your own life/)).toBeNull();
      fireEvent.click(screen.getByRole("button", { name: "About Humanistic and integrative" }));
      expect(screen.getByRole("tooltip").textContent).toMatch(/expert on your own life/);
      expect(screen.queryAllByRole("checkbox")).toHaveLength(0);
    });

    it("scrolls its headings in a box of their own, beneath the search box", () => {
      renderWithTips(<CheckboxGroup group={types} searchable isChecked={() => false} onToggle={() => {}} />);
      const box = screen.getByRole("button", { name: "Children and young people" }).closest(".overflow-y-auto");
      expect(box?.contains(screen.getByRole("button", { name: "Humanistic and integrative" }))).toBe(true);
      expect(box?.contains(screen.getByRole("searchbox"))).toBe(false);
    });

    it("opens a heading that holds a tick, and counts the ticks", () => {
      renderWithTips(<CheckboxGroup group={types} searchable={false} isChecked={(f) => f.value === "Child Counsellor"} onToggle={() => {}} />);
      expect(screen.getByRole("button", { name: "Children and young people, 1 ticked" }).getAttribute("aria-expanded")).toBe("true");
      screen.getByRole("checkbox", { name: "Child Counsellor" });
    });

    it("lists ticked boxes first under their heading", () => {
      renderWithTips(<CheckboxGroup group={types} searchable={false} isChecked={(f) => f.value === "Person Centred Psychotherapist"} onToggle={() => {}} />);
      const boxes = screen.getAllByRole("checkbox").map((c) => c.parentElement?.textContent);
      expect(boxes).toEqual(["Person Centred Psychotherapist", "Gestalt Psychotherapist"]);
    });

    it("shows every match under its heading while searching", () => {
      renderWithTips(<CheckboxGroup group={types} searchable isChecked={() => false} onToggle={() => {}} />);
      fireEvent.change(screen.getByRole("searchbox", { name: "Search Type of Therapy" }), { target: { value: "psycho" } });
      expect(screen.queryByRole("button", { name: "Humanistic and integrative" })).toBeNull();
      screen.getByText("Humanistic and integrative");
      screen.getByRole("button", { name: "About Humanistic and integrative" });
      expect(screen.getAllByRole("checkbox")).toHaveLength(2);
    });

    it("leaves a box ticked during a search in view once the search is cleared", () => {
      renderWithTips(<CheckboxGroup group={types} searchable isChecked={() => false} onToggle={() => {}} />);
      const search = screen.getByRole("searchbox", { name: "Search Type of Therapy" });
      fireEvent.change(search, { target: { value: "gestalt" } });
      fireEvent.click(screen.getByRole("checkbox", { name: "Gestalt Psychotherapist" }));
      fireEvent.change(search, { target: { value: "" } });
      expect(screen.getByRole("button", { name: "Humanistic and integrative" }).getAttribute("aria-expanded")).toBe("true");
    });
  });

  it("leaves the hint off groups of separate yes/no flags", () => {
    const flags = { label: "Additional Filters", fields: [{ name: "OnlyProfilesWithPhotos", value: "true", label: "Only show profiles with photos" }] };
    render(<CheckboxGroup group={flags} searchable={false} isChecked={() => true} onToggle={() => {}} />);
    expect(screen.queryByText(/each extra tick narrows/)).toBeNull();
  });
});
