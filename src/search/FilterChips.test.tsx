// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { emptyParams } from "@shared/query";
import { FilterChips } from "./FilterChips";
import { withHelpWithTerms } from "./state";

describe("FilterChips", () => {
  it("renders nothing when nothing narrows the search", () => {
    const { container } = render(<FilterChips params={emptyParams()} onChange={() => {}} />);
    expect(container.innerHTML).toBe("");
  });

  it("removes the filter whose chip is clicked", () => {
    const onChange = vi.fn();
    render(<FilterChips params={withHelpWithTerms(emptyParams(), ["Anxiety", "Trauma"])} onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: "Remove Anxiety" }));
    expect(onChange.mock.calls[0]?.[0].text.HelpWith).toBe("Trauma");
  });
});
