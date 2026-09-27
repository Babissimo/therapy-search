// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
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
});
