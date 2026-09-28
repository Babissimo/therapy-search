import { ORDER_SEED_POOL } from "@shared/query";
import { browserStorage } from "@/lib/storage";

const KEY = "ukcp-order-seed";

type SeedStorage = Pick<Storage, "getItem" | "setItem">;

/**
 * The visitor's shuffle seed for searches without a location. It persists so paging stays
 * consistent, and comes from a small pool so visitors share cache entries.
 */
export function orderSeed(storage: SeedStorage | null = browserStorage(), random: () => number = Math.random): number {
  const stored = Number(storage?.getItem(KEY));
  if (Number.isInteger(stored) && stored >= 1 && stored <= ORDER_SEED_POOL) return stored;
  const seed = 1 + Math.floor(random() * ORDER_SEED_POOL);
  try {
    storage?.setItem(KEY, String(seed));
  } catch {
    // Private browsing can refuse writes; the seed then lasts for this page load only.
  }
  return seed;
}
