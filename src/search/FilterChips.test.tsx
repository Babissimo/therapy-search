// @vitest-environment jsdom
import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, onTestFinished, vi } from "vitest";
import { emptyParams } from "@shared/query";
import { FilterChips } from "./FilterChips";
import { withHelpWithTerms } from "./state";

describe("FilterChips", () => {
  it("renders nothing when nothing narrows the search", () => {
    const { container } = render(<FilterChips params={emptyParams()} onRemove={() => {}} />);
    expect(container.innerHTML).toBe("");
  });

  it("names the filter whose chip is clicked, for the page to search without", () => {
    const onRemove = vi.fn();
    render(<FilterChips params={withHelpWithTerms(emptyParams(), ["Anxiety", "Trauma"])} onRemove={onRemove} />);
    fireEvent.click(screen.getByRole("button", { name: "Remove Anxiety" }));
    expect(onRemove).toHaveBeenCalledWith("HelpWith=Anxiety");
  });

  it("keeps a removed chip in its place, out of reach, until it has faded out", () => {
    // The exit animation the page's styles give it, which jsdom reads but never plays.
    const styles = document.head.appendChild(Object.assign(document.createElement("style"), { textContent: "[data-leaving] { animation-name: exit; }" }));
    onTestFinished(() => styles.remove());
    const { rerender } = render(<FilterChips params={withHelpWithTerms(emptyParams(), ["Anxiety", "Trauma"])} onRemove={() => {}} />);
    rerender(<FilterChips params={withHelpWithTerms(emptyParams(), ["Trauma"])} onRemove={() => {}} />);
    const chips = () => screen.getAllByRole("listitem").map((li) => [li.textContent, li.hasAttribute("inert")]);
    expect(chips()).toEqual([
      ["Anxiety", true],
      ["Trauma", false],
    ]);
    const leaving = screen.getByRole("button", { name: "Remove Anxiety" }).closest("li")!;
    // jsdom has no AnimationEvent.
    act(() => void leaving.dispatchEvent(Object.assign(new Event("animationend"), { animationName: "exit" })));
    expect(chips()).toEqual([["Trauma", false]]);
  });
});
