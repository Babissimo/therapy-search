import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

// Radix measures elements with ResizeObserver, which jsdom lacks.
globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
};

afterEach(() => cleanup());
