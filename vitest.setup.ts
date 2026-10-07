import { cleanup, screen } from "@testing-library/react";
import { afterEach } from "vitest";
import { forgetViews } from "@/search/viewMemory";

// Radix measures elements with ResizeObserver, which jsdom lacks.
globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
};

// A profile's header watches for sticking with IntersectionObserver, which jsdom lacks too; unobserved, it never sticks.
globalThis.IntersectionObserver ??= class {
  readonly root = null;
  readonly rootMargin = "";
  readonly scrollMargin = "";
  readonly thresholds = [];
  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords() {
    return [];
  }
};

afterEach(() => cleanup());

// Each test's first history entry is keyed "default", as a page load's is, so none may find what the last left there.
afterEach(() => forgetViews());

// Each test is a tab of its own, so none finds the profile the last opened over a page.
afterEach(() => {
  if (typeof sessionStorage !== "undefined") sessionStorage.clear();
});

if (typeof window !== "undefined") {
  // jsdom has no matchMedia: pages see a narrow screen without hover unless a test stubs its own.
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

  // A file's first role query parses jsdom's default stylesheet and compiles the selectors roles are matched by. Under
  // load that outlasts a findBy's one-second wait, so it is made here rather than in whichever test queries first.
  document.body.innerHTML = '<a href="/">Warm</a>';
  screen.getByRole("link", { name: "Warm" });
  document.body.innerHTML = "";
}
