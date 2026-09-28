// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { api, ApiError } from "@/lib/api";
import { useCentre } from "./usePlaces";

function withClient() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

/** Stops watching a query, then lets `ms` pass, long enough for a cache to drop what nobody reads. */
function unwatchedFor(ms: number, unmount: () => void) {
  vi.useFakeTimers();
  unmount();
  vi.advanceTimersByTime(ms);
  vi.useRealTimers();
}

afterEach(() => vi.restoreAllMocks());

describe("useCentre", () => {
  it("has nothing to look up without a searched place", () => {
    const place = vi.spyOn(api, "place");
    const { result } = renderHook(() => useCentre(undefined, false), { wrapper: withClient() });
    expect(result.current).toEqual({ settled: true });
    expect(place).not.toHaveBeenCalled();
  });

  it("looks the searched place up as a centre, and settles on its point", async () => {
    const place = vi.spyOn(api, "place").mockResolvedValue({ found: true, kind: "place", candidates: [{ lat: 50.82, lng: -0.14 }] });
    const { result } = renderHook(() => useCentre(" Brighton ", false), { wrapper: withClient() });
    expect(result.current.settled).toBe(false);
    await waitFor(() => expect(result.current).toEqual({ point: { lat: 50.82, lng: -0.14 }, settled: true }));
    expect(place).toHaveBeenCalledWith("BRIGHTON", { centre: true, outsideUK: false });
  });

  it("settles without a point when the lookup fails", async () => {
    vi.spyOn(api, "place").mockRejectedValue(new ApiError(502, "Couldn't look up that place just now."));
    const { result } = renderHook(() => useCentre("Brighton", false), { wrapper: withClient() });
    await waitFor(() => expect(result.current).toEqual({ point: undefined, settled: true }));
  });

  it("keeps its answer for the session, even while nothing reads it", async () => {
    const place = vi.spyOn(api, "place").mockResolvedValue({ found: true, kind: "place", candidates: [{ lat: 50.82, lng: -0.14 }] });
    const wrapper = withClient();
    const first = renderHook(() => useCentre("Brighton", false), { wrapper });
    await waitFor(() => expect(first.result.current.settled).toBe(true));
    unwatchedFor(60 * 60 * 1000, first.unmount);
    const again = renderHook(() => useCentre("Brighton", false), { wrapper });
    expect(again.result.current).toEqual({ point: { lat: 50.82, lng: -0.14 }, settled: true });
    expect(place).toHaveBeenCalledOnce();
  });
});
