import { describe, expect, it } from "vitest";
import { orderSeed } from "./orderSeed";

function memory(initial?: string) {
  const store = new Map<string, string>(initial ? [["ukcp-order-seed", initial]] : []);
  return { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v), store };
}

describe("orderSeed", () => {
  it("keeps a stored seed", () => {
    expect(orderSeed(memory("17"), () => 0.99)).toBe(17);
  });

  it("draws and stores a seed from the pool of 64 when none is stored", () => {
    const storage = memory();
    expect(orderSeed(storage, () => 0.5)).toBe(33);
    expect(storage.store.get("ukcp-order-seed")).toBe("33");
  });

  it("replaces a stored value outside the pool", () => {
    expect(orderSeed(memory("999"), () => 0)).toBe(1);
  });

  it("still works when storage refuses writes", () => {
    const refusing = { getItem: () => null, setItem: () => { throw new Error("quota"); } };
    expect(orderSeed(refusing, () => 0)).toBe(1);
  });
});
