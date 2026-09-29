// @vitest-environment jsdom
import { act, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ResultsSheet, type SheetPosition } from "./ResultsSheet";

function Harness({ start }: { start: SheetPosition }) {
  const [position, setPosition] = useState(start);
  return (
    <ResultsSheet position={position} onPositionChange={setPosition} title="3 results" footer={<button type="button">Load more</button>}>
      <a href="/therapist/jo">Jo</a>
    </ResultsSheet>
  );
}

const sheet = () => screen.getByRole("region", { name: "Results" });

/** jsdom lays nothing out: an 800px map area, so peek is 56px, half 400px and full 672px, with the sheet `height` tall. */
function measure(height: number) {
  Object.defineProperty(sheet().parentElement, "clientHeight", { configurable: true, value: 800 });
  vi.spyOn(sheet(), "getBoundingClientRect").mockReturnValue({ height } as DOMRect);
}

const header = () => screen.getByRole("heading", { name: "3 results" }).parentElement as HTMLElement;

afterEach(() => vi.restoreAllMocks());

describe("ResultsSheet", () => {
  it("lowers to show the map, and rises back to the list", () => {
    render(<Harness start="full" />);
    expect(sheet().dataset.position).toBe("full");
    fireEvent.click(screen.getByRole("button", { name: "Show map" }));
    expect(sheet().dataset.position).toBe("peek");
    fireEvent.click(screen.getByRole("button", { name: "Show list" }));
    expect(sheet().dataset.position).toBe("full");
  });

  it("rises to the list from halfway", () => {
    render(<Harness start="half" />);
    fireEvent.click(screen.getByRole("button", { name: "Show list" }));
    expect(sheet().dataset.position).toBe("full");
  });

  it("settles a drag of its header at the nearest height", () => {
    render(<Harness start="full" />);
    measure(672);
    fireEvent.pointerDown(header(), { clientY: 100 });
    fireEvent.pointerMove(header(), { clientY: 300 });
    fireEvent.pointerMove(header(), { clientY: 700 });
    fireEvent.pointerUp(header(), { clientY: 700 });
    expect(sheet().dataset.position).toBe("peek");
  });

  it("settles a flick whose pointer lifts before its one move has rendered", () => {
    render(<Harness start="full" />);
    measure(672);
    fireEvent.pointerDown(header(), { clientY: 100 });
    // Within one act, React renders nothing until both events are handled.
    act(() => {
      fireEvent.pointerMove(header(), { clientY: 380 });
      fireEvent.pointerUp(header(), { clientY: 380 });
    });
    expect(sheet().dataset.position).toBe("half");
  });

  it("keeps its count in view when lowered, and the hidden list and footer out of reach", () => {
    render(<Harness start="peek" />);
    expect(sheet().textContent).toContain("3 results");
    expect(screen.getByText("Jo").closest("[inert]")).not.toBeNull();
    expect(screen.getByText("Load more").closest("[inert]")).not.toBeNull();
  });

  it("keeps its footer outside the scrolling list", () => {
    render(<Harness start="full" />);
    const list = screen.getByText("Jo").parentElement!;
    expect(list.className).toContain("overflow-y-auto");
    expect(list.contains(screen.getByText("Load more"))).toBe(false);
  });
});
