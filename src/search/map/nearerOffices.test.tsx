// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Office, Profile, TherapistCard } from "@shared/types";
import { api, ApiError } from "@/lib/api";
import { nearerLocation, useNearerOffices } from "./nearerOffices";

const BRIGHTON = { lat: 50.8225, lng: -0.1372 };
const BN1 = { lat: 50.83, lng: -0.14 };
const HOVE = { lat: 50.835, lng: -0.178 };
const LEWES = { lat: 50.873, lng: 0.008 };
/** A postcode on the edge of Lewes nearest Brighton, well over a mile nearer than its district's centre. */
const LEWES_WEST = { lat: 50.86, lng: -0.03 };
const AT_BRIGHTON = { point: BRIGHTON, settled: true };

function withClient() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

const card = (slug: string, location?: string, distance?: string): TherapistCard => ({ slug, name: slug, initials: "T", tags: [], location, distance });
const office = (address: string[], isMain = false): Office => ({ name: "Office", isMain, address });
const profile = (slug: string, location: string | undefined, offices: Office[]): Profile => ({
  slug,
  name: slug,
  initials: "T",
  location,
  languages: [],
  emailInContact: false,
  social: [],
  about: [],
  practical: [],
  offices,
});

/** Places a location by its postal district: BN3 in Hove, BN7 in Lewes, anywhere else in central Brighton. */
function placeByDistrict() {
  return vi.spyOn(api, "place").mockImplementation(async (text) => ({
    found: true,
    kind: "outcode",
    candidates: [/\bBN3\b/.test(text) ? HOVE : text === "BN7 2AA" ? LEWES_WEST : /\bBN7\b/.test(text) ? LEWES : BN1],
  }));
}

const measured = card("measured", "Brighton BN1", "0.2 miles from Brighton");
const hoveAndLewes = (slug = "sam") => profile(slug, "Hove BN3", [office(["49 Church Road", "Hove BN3 2BE", "UK"], true), office(["Studio 22", "Lewes BN7 1YJ"])]);

afterEach(() => vi.restoreAllMocks());

describe("nearerLocation", () => {
  const hove = { location: "Hove BN3", point: HOVE };
  const lewes = { location: "Lewes BN7 1YJ", point: LEWES };

  it("gives the office nearest the centre when it is clearly nearer than the card's place", () => {
    expect(nearerLocation([lewes, hove], LEWES, BRIGHTON)).toBe("Hove BN3");
  });

  it("keeps the card's place when no office is more than a mile nearer", () => {
    expect(nearerLocation([hove, { location: "BN1", point: BN1 }], BN1, BRIGHTON)).toBeUndefined();
    expect(nearerLocation([hove], { lat: 50.84, lng: -0.19 }, BRIGHTON)).toBeUndefined();
  });

  it("gives the nearest office for a card placed nowhere, and nothing without an office", () => {
    expect(nearerLocation([lewes, hove], undefined, BRIGHTON)).toBe("Hove BN3");
    expect(nearerLocation([], LEWES, BRIGHTON)).toBeUndefined();
  });
});

describe("useNearerOffices", () => {
  it("reads no profile without a centre", () => {
    const read = vi.spyOn(api, "profile");
    const therapists = [measured, card("sam", "Lewes BN7")];
    const { result } = renderHook(() => useNearerOffices(therapists, { settled: true }, false), { wrapper: withClient() });
    expect(result.current).toEqual({ therapists, ready: therapists });
    expect(read).not.toHaveBeenCalled();
  });

  it("holds back a card without a distance while the centre is looked up", () => {
    const read = vi.spyOn(api, "profile");
    const therapists = [measured, card("sam", "Lewes BN7")];
    const { result } = renderHook(() => useNearerOffices(therapists, { settled: false }, false), { wrapper: withClient() });
    expect(result.current).toEqual({ therapists, ready: [measured] });
    expect(read).not.toHaveBeenCalled();
  });

  it("reads no profile when UKCP measured no card's distance, as when it searched the whole UK", () => {
    const read = vi.spyOn(api, "profile");
    const therapists = [card("a", "Lewes BN7"), card("b", "Hove BN3")];
    const { result } = renderHook(() => useNearerOffices(therapists, AT_BRIGHTON, false), { wrapper: withClient() });
    expect(result.current).toEqual({ therapists, ready: therapists });
    expect(read).not.toHaveBeenCalled();
  });

  it("reads no profile for a search outside the UK, where a card's location can't name its country", () => {
    const read = vi.spyOn(api, "profile");
    const therapists = [measured, card("sam", "Lewes BN7")];
    const { result } = renderHook(() => useNearerOffices(therapists, AT_BRIGHTON, true), { wrapper: withClient() });
    expect(result.current).toEqual({ therapists, ready: therapists });
    expect(read).not.toHaveBeenCalled();
  });

  it("reads the profiles of at most four cards, and only those without a distance", async () => {
    placeByDistrict();
    const read = vi.spyOn(api, "profile").mockImplementation(async (slug) => profile(slug, undefined, []));
    const unmeasured = ["a", "b", "c", "d", "e"].map((slug) => card(slug, "Lewes BN7"));
    const { result } = renderHook(() => useNearerOffices([measured, ...unmeasured], AT_BRIGHTON, false), { wrapper: withClient() });
    await waitFor(() => expect(result.current.ready).toHaveLength(6));
    expect(read.mock.calls.map(([slug]) => slug)).toEqual(["a", "b", "c", "d"]);
  });

  it("moves a card to the profile's office nearest the centre, keeping it off the map until it knows", async () => {
    const place = placeByDistrict();
    vi.spyOn(api, "profile").mockResolvedValue(hoveAndLewes());
    const sam = card("sam", "Lewes BN7");
    const { result } = renderHook(() => useNearerOffices([measured, sam], AT_BRIGHTON, false), { wrapper: withClient() });
    expect(result.current).toEqual({ therapists: [measured, sam], ready: [measured] });
    const moved = [measured, { ...sam, location: "Hove BN3" }];
    await waitFor(() => expect(result.current).toEqual({ therapists: moved, ready: moved }));
    // The office is looked up as the profile's map looks it up, so opening the profile asks for nothing more.
    expect(place).toHaveBeenCalledWith("BN3 2BE", { outsideUK: false });
  });

  it("asks once for an office that two therapists share", async () => {
    const place = placeByDistrict();
    const warn = vi.spyOn(console, "warn");
    vi.spyOn(api, "profile").mockImplementation(async (slug) => hoveAndLewes(slug));
    const therapists = [measured, card("sam", "Lewes BN7"), card("jo", "Lewes BN7")];
    const { result } = renderHook(() => useNearerOffices(therapists, AT_BRIGHTON, false), { wrapper: withClient() });
    await waitFor(() => expect(result.current.ready.map((t) => t.location)).toEqual(["Brighton BN1", "Hove BN3", "Hove BN3"]));
    expect(place.mock.calls.filter(([text]) => text === "BN3 2BE")).toHaveLength(1);
    expect(warn).not.toHaveBeenCalled();
  });

  it("keeps a card whose own place is nearest", async () => {
    placeByDistrict();
    vi.spyOn(api, "profile").mockResolvedValue(profile("marta", undefined, [office(["Online"], true), office(["Brighton, BN1"]), office(["Hove BN3"])]));
    const therapists = [measured, card("marta", "BN1")];
    const { result } = renderHook(() => useNearerOffices(therapists, AT_BRIGHTON, false), { wrapper: withClient() });
    await waitFor(() => expect(result.current.ready).toHaveLength(2));
    expect(result.current.therapists).toEqual(therapists);
  });

  it("keeps a card whose other offices are all in its own district, where the one it shows is", async () => {
    const place = placeByDistrict();
    vi.spyOn(api, "profile").mockResolvedValue(profile("sam", undefined, [office(["Lewes BN7 2AA"], true)]));
    const therapists = [measured, card("sam", "Lewes BN7")];
    const { result } = renderHook(() => useNearerOffices(therapists, AT_BRIGHTON, false), { wrapper: withClient() });
    await waitFor(() => expect(result.current.ready).toHaveLength(2));
    expect(result.current.therapists).toEqual(therapists);
    expect(place).not.toHaveBeenCalledWith("BN7 2AA", expect.anything());
  });

  it("leaves offices abroad unplaced, as none can be nearest a search at home", async () => {
    const place = placeByDistrict();
    vi.spyOn(api, "profile").mockResolvedValue(profile("sam", undefined, [office(["Belzinger Ring", "Berlin 12689", "Germany"], true)]));
    const therapists = [measured, card("sam", "Lewes BN7")];
    const { result } = renderHook(() => useNearerOffices(therapists, AT_BRIGHTON, false), { wrapper: withClient() });
    await waitFor(() => expect(result.current.ready).toHaveLength(2));
    expect(result.current.therapists).toEqual(therapists);
    expect(place.mock.calls.map(([text]) => text)).toEqual(["LEWES BN7"]);
  });

  it("keeps a card whose profile can't be read", async () => {
    placeByDistrict();
    vi.spyOn(api, "profile").mockRejectedValue(new ApiError(404, "This profile isn't on UKCP any more."));
    const therapists = [measured, card("sam", "Lewes BN7")];
    const { result } = renderHook(() => useNearerOffices(therapists, AT_BRIGHTON, false), { wrapper: withClient() });
    await waitFor(() => expect(result.current.ready).toHaveLength(2));
    expect(result.current.therapists).toEqual(therapists);
  });
});
