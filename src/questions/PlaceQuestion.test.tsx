// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { describe, expect, it, vi } from "vitest";
import { PlaceQuestion } from "./PlaceQuestion";

describe("PlaceQuestion", () => {
  it("takes a postcode or town as typed, and moves on with Enter", () => {
    const onChange = vi.fn();
    const onNext = vi.fn();
    render(<PlaceQuestion place="" onChange={onChange} count="Question 5 of 8" onNext={onNext} />, { wrapper: MemoryRouter });
    const box = screen.getByRole("textbox", { name: "Postcode or town" });
    fireEvent.change(box, { target: { value: "LS6 " } });
    expect(onChange).toHaveBeenCalledWith("LS6 ");
    fireEvent.submit(box.closest("form")!);
    expect(onNext).toHaveBeenCalledOnce();
  });
});
