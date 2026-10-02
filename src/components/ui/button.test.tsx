// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Button } from "./button";

describe("Button", () => {
  it("takes a touch target centred on itself, whatever its size", () => {
    render(
      <>
        <Button size="icon-sm">Small</Button>
        <Button size="xs">Smaller</Button>
      </>,
    );
    for (const name of ["Small", "Smaller"]) {
      const { classList } = screen.getByRole("button", { name });
      expect([classList.contains("touch-target"), classList.contains("relative")]).toEqual([true, true]);
    }
  });

  it("stays where it is placed absolutely, its target centred there", () => {
    render(<Button className="absolute top-0.5 right-0.5">Placed</Button>);
    const { classList } = screen.getByRole("button", { name: "Placed" });
    expect([classList.contains("absolute"), classList.contains("relative"), classList.contains("touch-target")]).toEqual([true, false, true]);
  });
});
