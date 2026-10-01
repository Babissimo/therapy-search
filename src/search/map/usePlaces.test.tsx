// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { PlaceLookup } from "@shared/location";
import type { OfficeDetails } from "@shared/office";
import type { TherapistCard } from "@shared/types";
import { api, ApiError } from "@/lib/api";
import type { Pin } from "./pins";
import { useCardLookups, useCentre, usePins } from "./usePlaces";

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

describe("useCardLookups", () => {
  it("looks each distinct location up once, and never one too general to place", async () => {
    const place = vi.spyOn(api, "place").mockResolvedValue({ found: true, kind: "outcode", candidates: [{ lat: 50.83, lng: -0.15 }] });
    const { result } = renderHook(() => useCardLookups(["Brighton bn3", "BRIGHTON BN3", " BN", undefined], false), { wrapper: withClient() });
    const tooGeneral = { ok: true, lookup: { found: false, reason: "too-general" } };
    expect([result.current(" BN"), result.current(undefined)]).toEqual([tooGeneral, tooGeneral]);
    await waitFor(() => expect(result.current("Brighton BN3")).toMatchObject({ ok: true, lookup: { found: true } }));
    expect(place).toHaveBeenCalledOnce();
    expect(place).toHaveBeenCalledWith("BRIGHTON BN3", { outsideUK: false });
  });

  it("reports a lookup that failed", async () => {
    vi.spyOn(api, "place").mockRejectedValue(new ApiError(429, "Too many lookups in a short time."));
    const { result } = renderHook(() => useCardLookups(["BN3"], false), { wrapper: withClient() });
    await waitFor(() => expect(result.current("BN3")).toEqual({ ok: false }));
  });

  it("keeps each answer for the session, even while nothing reads it", async () => {
    const place = vi.spyOn(api, "place").mockResolvedValue({ found: true, kind: "outcode", candidates: [{ lat: 50.83, lng: -0.15 }] });
    const wrapper = withClient();
    const first = renderHook(() => useCardLookups(["Brighton BN3"], false), { wrapper });
    await waitFor(() => expect(first.result.current("Brighton BN3")).toMatchObject({ ok: true }));
    unwatchedFor(60 * 60 * 1000, first.unmount);
    const again = renderHook(() => useCardLookups(["Brighton BN3"], false), { wrapper });
    expect(again.result.current("Brighton BN3")).toMatchObject({ ok: true, lookup: { found: true } });
    expect(place).toHaveBeenCalledOnce();
  });
});

describe("usePins", () => {
  const card = (slug: string, location?: string): TherapistCard => ({ slug, name: slug, initials: "T", tags: [], location });
  const CENTRE = { point: { lat: 50.82, lng: -0.14 }, settled: true };
  const DISTRICT = { lat: 50.83, lng: -0.15 };
  const OFFICE = { lat: 50.824, lng: -0.139 };
  const at = (kind: "postcode" | "outcode", point: { lat: number; lng: number }): PlaceLookup => ({ found: true, kind, candidates: [point] });
  /** Answers each text looked up from `answers`, rejecting it where the answer is an error. */
  const places = (answers: Record<string, PlaceLookup | Error>) =>
    vi.spyOn(api, "place").mockImplementation(async (text) => {
      const answer = answers[text] ?? { found: false, reason: "not-found" };
      if (answer instanceof Error) throw answer;
      return answer;
    });
  /** Each pin's point with the slugs of those on it. */
  const laidOut = (pins: Pin[]) => pins.map((pin) => [pin.point, pin.therapists.map((t) => t.slug)]);

  it("pins a card at its district at once, and moves it to its office's postcode once that is placed", async () => {
    places({ "BRIGHTON BN1": at("outcode", DISTRICT), "BN1 1EL": at("postcode", OFFICE) });
    let answer = (_: OfficeDetails) => {};
    const office = vi.spyOn(api, "office").mockReturnValue(new Promise((resolve) => (answer = resolve)));
    const therapists = [card("jo", "Brighton BN1")];
    const { result } = renderHook(() => usePins(therapists, CENTRE, false), { wrapper: withClient() });
    await waitFor(() => expect(laidOut(result.current.pins)).toEqual([[DISTRICT, ["jo"]]]));
    // The office's postcode holds back no frame, only a keyboard waiting to move on.
    expect([result.current.placing, result.current.moving]).toEqual([false, true]);
    expect(office).toHaveBeenCalledWith("jo", "BRIGHTON BN1", expect.any(AbortSignal));
    answer({ postcode: "BN1 1EL", cost: "£70" });
    await waitFor(() => expect(laidOut(result.current.pins)).toEqual([[OFFICE, ["jo"]]]));
    expect(result.current.pins[0]).toMatchObject({ kind: "postcode", offices: { jo: "BN1 1EL" } });
    expect(result.current.moving).toBe(false);
  });

  it("leaves a pin at its district when the profile gives no postcode there, or a lookup fails", async () => {
    const place = places({ "BRIGHTON BN1": at("outcode", DISTRICT), "BN1 9ZZ": new ApiError(502, "Couldn't look up that place just now.") });
    const office = vi.spyOn(api, "office").mockImplementation(async (slug) => {
      if (slug === "none") return { cost: "£70" };
      if (slug === "failed") throw new ApiError(502, "UKCP's search isn't responding.");
      return { postcode: "BN1 9ZZ" };
    });
    const therapists = ["none", "failed", "unplaceable"].map((slug) => card(slug, "Brighton BN1"));
    const { result } = renderHook(() => usePins(therapists, CENTRE, false), { wrapper: withClient() });
    await waitFor(() => expect(place).toHaveBeenCalledWith("BN1 9ZZ", { outsideUK: false }));
    await waitFor(() => expect(office).toHaveBeenCalledTimes(3));
    expect(laidOut(result.current.pins)).toEqual([[DISTRICT, ["none", "failed", "unplaceable"]]]);
  });

  it("leaves a pin at its district when the office's postcode lies in another", async () => {
    const place = places({ "BRIGHTON BN1": at("outcode", DISTRICT), "BN3 2FL": at("postcode", OFFICE) });
    const office = vi.spyOn(api, "office").mockResolvedValue({ postcode: "BN3 2FL" });
    const { result } = renderHook(() => usePins([card("jo", "Brighton BN1")], CENTRE, false), { wrapper: withClient() });
    await waitFor(() => expect(office).toHaveBeenCalled());
    await waitFor(() => expect(result.current.moving).toBe(false));
    expect(laidOut(result.current.pins)).toEqual([[DISTRICT, ["jo"]]]);
    expect(place).not.toHaveBeenCalledWith("BN3 2FL", expect.anything());
  });

  it("moves only a card giving no more than a district, and waits on no other card's office", async () => {
    const place = places({ "BN3 2FL": at("postcode", OFFICE), BRIGHTON: at("outcode", DISTRICT), "BN1 9ZZ": at("postcode", OFFICE) });
    vi.spyOn(api, "office").mockImplementation(async (slug) => (slug === "b" ? { postcode: "BN1 9ZZ" } : new Promise(() => {})));
    const therapists = [card("a", "BN3 2FL"), card("b", "Brighton")];
    const { result } = renderHook(() => usePins(therapists, CENTRE, false), { wrapper: withClient() });
    await waitFor(() => expect(laidOut(result.current.pins)).toEqual([[OFFICE, ["a"]], [DISTRICT, ["b"]]]));
    expect([result.current.placing, result.current.moving]).toEqual([false, false]);
    expect(place).not.toHaveBeenCalledWith("BN1 9ZZ", expect.anything());
  });

  it("asks nothing in a search outside the UK", async () => {
    places({ "BRIGHTON BN1": at("outcode", DISTRICT) });
    const office = vi.spyOn(api, "office");
    const { result } = renderHook(() => usePins([card("d", "Brighton BN1")], CENTRE, true), { wrapper: withClient() });
    await waitFor(() => expect(result.current.placing).toBe(false));
    expect(office).not.toHaveBeenCalled();
  });
});
