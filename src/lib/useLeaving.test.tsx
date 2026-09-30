// @vitest-environment jsdom
import { act, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { useLeaving } from "./useLeaving";

function List({ items }: { items: string[] }) {
  const shown = useLeaving(items, (item) => item);
  return (
    <ul>
      {shown.map(({ key, item, props }) => (
        <li key={key} {...props}>
          {item}
        </li>
      ))}
    </ul>
  );
}

let styles: HTMLStyleElement | undefined;
afterEach(() => styles?.remove());

/** Gives a leaving element the exit animation the page's styles would, which jsdom reads but never plays. */
function withExit() {
  styles = document.createElement("style");
  styles.textContent = "[data-leaving] { animation-name: exit; }";
  document.head.append(styles);
}

// jsdom has no AnimationEvent.
function ended(element: Element, animationName: string) {
  act(() => void element.dispatchEvent(Object.assign(new Event("animationend"), { animationName })));
}

const items = (container: HTMLElement) => [...container.querySelectorAll("li")];
const item = (container: HTMLElement, text: string) => items(container).find((li) => li.textContent === text)!;
const texts = (container: HTMLElement) => items(container).map((li) => li.textContent);

describe("useLeaving", () => {
  it("keeps an item that goes in its place, out of reach, until its exit animation ends", () => {
    withExit();
    const { container, rerender } = render(<List items={["a", "b", "c"]} />);
    rerender(<List items={["a", "c"]} />);
    const b = item(container, "b");
    expect(texts(container)).toEqual(["a", "b", "c"]);
    expect(b.hasAttribute("inert")).toBe(true);
    expect(b.hasAttribute("data-leaving")).toBe(true);
    // Others coming and going leave it where it was.
    rerender(<List items={["d", "a", "c"]} />);
    expect(texts(container)).toEqual(["d", "a", "b", "c"]);
    // The entrance its exit cut short.
    ended(b, "enter");
    expect(texts(container)).toEqual(["d", "a", "b", "c"]);
    ended(b, "exit");
    expect(texts(container)).toEqual(["d", "a", "c"]);
  });

  it("lets an item with no exit animation to play go at once", () => {
    const { container, rerender } = render(<List items={["a", "b"]} />);
    rerender(<List items={["a"]} />);
    expect(texts(container)).toEqual(["a"]);
  });

  it("marks those arriving after the first draw as entering, and one back before it had gone", () => {
    withExit();
    const { container, rerender } = render(<List items={["a", "b"]} />);
    expect(item(container, "a").hasAttribute("data-entering")).toBe(false);
    rerender(<List items={["a", "b", "c"]} />);
    expect(item(container, "c").hasAttribute("data-entering")).toBe(true);
    rerender(<List items={["b", "c"]} />);
    rerender(<List items={["a", "b", "c"]} />);
    const a = item(container, "a");
    expect(texts(container)).toEqual(["a", "b", "c"]);
    expect(a.hasAttribute("inert")).toBe(false);
    expect(a.hasAttribute("data-leaving")).toBe(false);
    expect(a.hasAttribute("data-entering")).toBe(true);
  });
});
