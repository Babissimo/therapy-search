// @vitest-environment jsdom
import { act, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { coverOf, ResultsSheet, type SheetPosition } from "./ResultsSheet";

function Harness({ start }: { start: SheetPosition }) {
  const [position, setPosition] = useState(start);
  return (
    <ResultsSheet
      position={position}
      onPositionChange={setPosition}
      tabs={
        <button type="button" role="tab">
          Shortlist
        </button>
      }
      footer={<button type="button">Load more</button>}
    >
      <a href="/therapist/jo">Jo</a>
    </ResultsSheet>
  );
}

const sheet = () => screen.getByRole("region", { name: "Results and shortlist" });

/** jsdom lays nothing out: an 800px map area, so peek is 56px, half 400px and full 672px, with the sheet `height` tall. */
function measure(height: number) {
  Object.defineProperty(sheet().parentElement, "clientHeight", { configurable: true, value: 800 });
  vi.spyOn(sheet(), "getBoundingClientRect").mockReturnValue({ height } as DOMRect);
}

const tab = () => screen.getByRole("tab", { name: "Shortlist" });
const header = () => tab().parentElement as HTMLElement;

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

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

  it("stops further below the top at full on touch screens, where Use my location is named beneath the search box", () => {
    const touch = (query: string) => ({ matches: query === "(pointer: coarse)", media: query, addEventListener() {}, removeEventListener() {} });
    vi.stubGlobal("matchMedia", touch);
    render(<Harness start="full" />);
    expect(sheet().style.height).toBe("calc(100% - 12.5rem)");
    // Dragged up past full, it stops 12.5rem short of the 800px map area's top.
    measure(600);
    fireEvent.pointerDown(header(), { clientY: 300 });
    fireEvent.pointerMove(header(), { clientY: 0 });
    expect(sheet().style.height).toBe("600px");
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

  it("rises to the list when a tab is pressed while lowered", () => {
    render(<Harness start="peek" />);
    fireEvent.click(tab());
    expect(sheet().dataset.position).toBe("full");
  });

  it("stays put when a tab is pressed at half height", () => {
    render(<Harness start="half" />);
    fireEvent.click(tab());
    expect(sheet().dataset.position).toBe("half");
  });

  it("leaves a press on a tab to the tab rather than dragging", () => {
    render(<Harness start="full" />);
    measure(672);
    fireEvent.pointerDown(tab(), { clientY: 100 });
    fireEvent.pointerMove(header(), { clientY: 700 });
    fireEvent.pointerUp(header(), { clientY: 700 });
    expect(sheet().dataset.position).toBe("full");
  });

  it("keeps its tabs in view when lowered, and the hidden list and footer out of reach", () => {
    render(<Harness start="peek" />);
    expect(tab().closest("[inert]")).toBeNull();
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

describe("coverOf", () => {
  it("covers as much of the map as the sheet is tall, and at full as much as Show map lowers it to", () => {
    expect(coverOf("peek", 800)).toBe(56);
    expect(coverOf("half", 800)).toBe(400);
    expect(coverOf("full", 800)).toBe(56);
  });
});
