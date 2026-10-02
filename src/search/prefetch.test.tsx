// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { onlineSearch } from "@shared/online";
import { toQuery } from "@shared/query";
import { api } from "@/lib/api";
import { listed } from "@/lib/listed.testing";
import { prefetchSearchAt } from "./prefetch";
import { useResults } from "./useResults";
import { readSearch } from "./useSearchState";

vi.mock("./map/MapPane", () => ({ default: () => null }));

const newClient = () => new QueryClient({ defaultOptions: { queries: { retry: false } } });

const NONE = listed({ total: 0, from: 0, to: 0, notices: [], therapists: [] });

function answer() {
  return vi.spyOn(api, "search").mockResolvedValue(NONE);
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("prefetchSearchAt", () => {
  it("asks for a search near a place, and its nearest few, before the page does, which then asks for nothing more", async () => {
    const search = answer();
    const early = vi.spyOn(api, "searchEarly").mockResolvedValue(NONE);
    const client = newClient();
    prefetchSearchAt(client, "#/?Location=Bristol");
    expect(search.mock.calls).toEqual([[toQuery(readSearch("?Location=Bristol"))]]);
    expect(early.mock.calls).toEqual([[toQuery(readSearch("?Location=Bristol"))]]);
    const { result } = renderHook(() => useResults(readSearch("?Location=Bristol")), {
      wrapper: ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>,
    });
    await waitFor(() => expect(result.current.query.isSuccess).toBe(true));
    expect([search, early].map((call) => call.mock.calls.length)).toEqual([1, 1]);
  });

  it.each(["#/online?KeywordFilter=grief", "#online?KeywordFilter=grief", "#/Online/?KeywordFilter=grief"])(
    "asks for an online search as the online view will, at %s as the router reads it",
    (hash) => {
      const search = answer();
      const early = vi.spyOn(api, "searchEarly");
      prefetchSearchAt(newClient(), hash);
      expect(search.mock.calls).toEqual([[toQuery(onlineSearch(readSearch("?KeywordFilter=grief")))]]);
      expect(early).not.toHaveBeenCalled();
    },
  );

  it.each([
    ["no search", "#/"],
    ["a filter without a place", "#/?KeywordFilter=grief"],
    ["online with nothing to narrow it", "#/online"],
    ["a profile", "#/therapist/Jo-ABCDEFGH?Location=Bristol"],
    ["a search the page can't read", "#/?Location=Bristol&OnlyWheelchairAccessible=maybe"],
  ])("asks for nothing at %s", (_, hash) => {
    const search = answer();
    prefetchSearchAt(newClient(), hash);
    expect(search).not.toHaveBeenCalled();
  });
});

describe("warmMap", () => {
  /** How often the map's code has been fetched since the modules were made afresh. */
  let fetched = 0;

  /** This module afresh, on a window wide and tall enough for the map to show beside the list, or not. */
  async function freshOn(wide: boolean) {
    vi.resetModules();
    fetched = 0;
    vi.doMock("./map/MapPane", () => {
      fetched++;
      return { default: () => null };
    });
    vi.stubGlobal("matchMedia", (query: string) => ({ matches: wide && query === "(min-width: 64rem) and (min-height: 31rem)" }));
    return import("./prefetch");
  }

  it("fetches the map's code ahead where the map shows beside the list", async () => {
    (await freshOn(true)).warmMap();
    await vi.waitFor(() => expect(fetched).toBe(1));
  });

  it("leaves the map's code until the map is asked for where the list leads", async () => {
    const { warmMap, loadMap } = await freshOn(false);
    warmMap();
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(fetched).toBe(0);
    await loadMap();
    expect(fetched).toBe(1);
  });
});
