// @vitest-environment jsdom
import { act, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { createStore, useStore, type Store } from "./store";

describe("createStore", () => {
  it("replaces its value, telling each subscriber until it unsubscribes", () => {
    const store = createStore("a");
    const onChange = vi.fn();
    const unsubscribe = store.subscribe(onChange);
    store.set("b");
    expect(store.get()).toBe("b");
    expect(onChange).toHaveBeenCalledTimes(1);
    unsubscribe();
    store.set("c");
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it("tells no one when set to the value it holds", () => {
    const store = createStore("a");
    const onChange = vi.fn();
    store.subscribe(onChange);
    store.set("a");
    expect(onChange).not.toHaveBeenCalled();
  });
});

describe("useStore", () => {
  function Probe({ store }: { store: Store<string> }) {
    return <output>{useStore(store)}</output>;
  }

  it("redraws with the store's value as it changes", () => {
    const store = createStore("a");
    render(<Probe store={store} />);
    act(() => store.set("b"));
    expect(screen.getByRole("status").textContent).toBe("b");
  });
});
