import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

// Radix measures elements with ResizeObserver, which jsdom lacks.
globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
};

afterEach(() => cleanup());

// jsdom has no matchMedia: pages see a narrow screen without hover unless a test stubs its own.
if (typeof window !== "undefined") {
  window.matchMedia ??= (query) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener() {},
    removeListener() {},
    addEventListener() {},
    removeEventListener() {},
    dispatchEvent: () => false,
  });
}
