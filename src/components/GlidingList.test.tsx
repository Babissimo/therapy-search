// @vitest-environment jsdom
import { render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GlidingList } from "./GlidingList";

const list = (keys: string[], hidden = false) => (
  <div hidden={hidden}>
    <GlidingList>
      {keys.map((key) => (
        <li key={key}>{key}</li>
      ))}
    </GlidingList>
  </div>
);

describe("GlidingList", () => {
  const animate = vi.fn(() => ({ playState: "finished", cancel() {} }));
  /** Each glide begun, as the item glided and the translate it glided from. */
  const glides = () => animate.mock.calls.map((call, i) => [(animate.mock.contexts[i] as Element).textContent, (call as unknown[])[0]]);

  beforeEach(() => {
    // jsdom lays nothing out and animates nothing: here each item stands 100px right of the one before it, and one hidden
    // with what holds it has no box, reading as at its parent's corner.
    vi.spyOn(HTMLElement.prototype, "offsetLeft", "get").mockImplementation(function (this: HTMLElement) {
      return this.closest("[hidden]") ? 0 : [...(this.parentElement?.children ?? [])].indexOf(this) * 100;
    });
    vi.spyOn(Element.prototype, "getClientRects").mockImplementation(function (this: Element) {
      return (this.closest("[hidden]") ? [] : [{}]) as unknown as DOMRectList;
    });
    Object.defineProperty(Element.prototype, "animate", { value: animate, configurable: true });
  });
  afterEach(() => {
    vi.restoreAllMocks();
    animate.mockClear();
    delete (Element.prototype as Partial<Element>).animate;
  });

  it("glides the items after one that goes into the room it leaves, from where they stood", () => {
    const { rerender } = render(list(["a", "b", "c"]));
    rerender(list(["b", "c"]));
    expect(glides()).toEqual([
      ["b", { translate: ["100px 0px", "0 0"] }],
      ["c", { translate: ["100px 0px", "0 0"] }],
    ]);
  });

  it("glides the items after one that arrives aside to make room for it", () => {
    const { rerender } = render(list(["a", "c"]));
    rerender(list(["a", "b", "c"]));
    expect(glides()).toEqual([["c", { translate: ["-100px 0px", "0 0"] }]]);
  });

  it("leaves items that stay put, and any under reduced motion, where they are", () => {
    const { rerender } = render(list(["a", "b"]));
    rerender(list(["a", "b", "c"]));
    vi.spyOn(window, "matchMedia").mockReturnValue({ matches: true } as MediaQueryList);
    rerender(list(["b", "c"]));
    expect(animate).not.toHaveBeenCalled();
  });

  it("glides nothing as what holds it hides it and shows it again", () => {
    const { rerender } = render(list(["a", "b", "c"]));
    rerender(list(["a", "b", "c"], true));
    rerender(list(["a", "b", "c"]));
    expect(animate).not.toHaveBeenCalled();
  });
});
