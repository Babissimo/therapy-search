// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useOfficePlace } from "@/profile/place";
import { useCardLookups, useCentre } from "@/search/map/usePlaces";
import { api } from "./api";

function withClient() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

afterEach(() => vi.restoreAllMocks());

describe("placeLookup", () => {
  it("asks once for a place that a card and a profile's office both name", async () => {
    const place = vi.spyOn(api, "place").mockResolvedValue({ found: true, kind: "postcode", candidates: [{ lat: 50.83, lng: -0.17 }] });
    const wrapper = withClient();
    const card = renderHook(() => useCardLookups(["BN3 1AA"], false), { wrapper });
    await waitFor(() => expect(card.result.current("BN3 1AA")).toMatchObject({ ok: true }));
    const office = renderHook(() => useOfficePlace({ name: "Office", isMain: false, address: ["2 Sea Road", "Hove BN3 1AA"] }, undefined), { wrapper });
    expect(office.result.current).toEqual({ point: { lat: 50.83, lng: -0.17 }, zoom: 15 });
    expect(place).toHaveBeenCalledOnce();
  });

  it("asks again for a searched place, which is looked up as a centre", async () => {
    const place = vi.spyOn(api, "place").mockResolvedValue({ found: true, kind: "place", candidates: [{ lat: 50.82, lng: -0.14 }] });
    const wrapper = withClient();
    const card = renderHook(() => useCardLookups(["Brighton"], false), { wrapper });
    await waitFor(() => expect(card.result.current("Brighton")).toMatchObject({ ok: true }));
    const centre = renderHook(() => useCentre("Brighton", false), { wrapper });
    await waitFor(() => expect(centre.result.current.settled).toBe(true));
    expect(place.mock.calls).toEqual([["BRIGHTON", { outsideUK: false }], ["BRIGHTON", { centre: true, outsideUK: false }]]);
  });
});
