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

/** Gives an arriving element the entrance and a leaving one the exit the page's styles would, which jsdom reads but never plays. */
function withAnimations() {
  styles = document.createElement("style");
  styles.textContent = "[data-entering] { animation-name: enter; } [data-leaving] { animation-name: exit; }";
  document.head.append(styles);
}

// jsdom has no AnimationEvent.
function ended(element: Element, animationName: string, type = "animationend") {
  act(() => void element.dispatchEvent(Object.assign(new Event(type), { animationName })));
}

const items = (container: HTMLElement) => [...container.querySelectorAll("li")];
const item = (container: HTMLElement, text: string) => items(container).find((li) => li.textContent === text)!;
const texts = (container: HTMLElement) => items(container).map((li) => li.textContent);

describe("useLeaving", () => {
  it("keeps an item that goes in its place, out of reach, until its exit animation ends", () => {
    withAnimations();
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

  it("lets an item with no exit animation to play go at once, and one with no entrance arrive at once", () => {
    const { container, rerender } = render(<List items={["a", "b"]} />);
    rerender(<List items={["a"]} />);
    expect(texts(container)).toEqual(["a"]);
    rerender(<List items={["a", "c"]} />);
    expect(item(container, "c").hasAttribute("data-entering")).toBe(false);
  });

  it("marks those arriving after the first draw as entering, and one back before it had gone", () => {
    withAnimations();
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

  it("marks one entering only until its entrance ends or is cut short, so hiding it and showing it again doesn't replay it", () => {
    withAnimations();
    const { container, rerender } = render(<List items={["a"]} />);
    rerender(<List items={["a", "b", "c"]} />);
    // Others coming leave it entering.
    rerender(<List items={["a", "b", "c", "d"]} />);
    expect(item(container, "b").hasAttribute("data-entering")).toBe(true);
    ended(item(container, "b"), "enter");
    // Hidden as it enters.
    ended(item(container, "c"), "enter", "animationcancel");
    rerender(<List items={["a", "b", "c", "d", "e"]} />);
    expect(item(container, "b").hasAttribute("data-entering")).toBe(false);
    expect(item(container, "c").hasAttribute("data-entering")).toBe(false);
    expect(item(container, "d").hasAttribute("data-entering")).toBe(true);
  });
});
