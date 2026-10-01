// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { applyTheme, storedTheme, storeTheme } from "./theme";

function memory(initial?: string) {
  const store = new Map<string, string>(initial ? [["theme", initial]] : []);
  return {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
    store,
  };
}

describe("storedTheme", () => {
  it("returns a stored light or dark choice", () => {
    expect(storedTheme(memory("light"))).toBe("light");
    expect(storedTheme(memory("dark"))).toBe("dark");
  });

  it("follows the system when nothing valid is stored", () => {
    expect(storedTheme(memory())).toBe("system");
    expect(storedTheme(memory("sepia"))).toBe("system");
    expect(storedTheme(null)).toBe("system");
  });

  it("follows the system when storage refuses reads", () => {
    const refusing = { ...memory("dark"), getItem: () => { throw new Error("corrupt"); } };
    expect(storedTheme(refusing)).toBe("system");
  });
});

describe("storeTheme", () => {
  it("keeps light or dark, and forgets the choice for system", () => {
    const storage = memory();
    storeTheme("dark", storage);
    expect(storage.store.get("theme")).toBe("dark");
    storeTheme("system", storage);
    expect(storage.store.has("theme")).toBe(false);
  });

  it("still works when storage refuses writes", () => {
    const refusing = { ...memory(), setItem: () => { throw new Error("quota"); } };
    expect(() => storeTheme("light", refusing)).not.toThrow();
  });
});

describe("applyTheme", () => {
  it.each([
    ["light", false, false],
    ["light", true, false],
    ["dark", false, true],
    ["system", false, false],
    ["system", true, true],
  ] as const)("%s, with the system dark %s, sets dark %s", (choice, systemDark, dark) => {
    const root = document.createElement("html");
    root.classList.toggle("dark", !dark);
    applyTheme(choice, systemDark, root);
    expect(root.classList.contains("dark")).toBe(dark);
  });
});
