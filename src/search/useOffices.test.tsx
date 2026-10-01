// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { TherapistCard } from "@shared/types";
import { api, ApiError } from "@/lib/api";
import { useOffices } from "./useOffices";

function withClient() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

const card = (slug: string, location?: string): TherapistCard => ({ slug, name: slug, initials: "T", tags: [], location });

afterEach(() => vi.restoreAllMocks());

describe("useOffices", () => {
  it("asks about each card's office by the place the card names, and answers what the profile gives", async () => {
    const office = vi.spyOn(api, "office").mockImplementation(async (slug) => (slug === "a" ? { postcode: "BN1 1EL", cost: "£70" } : {}));
    const therapists = [card("a", "Brighton  BN1"), card("b", "BN3 2FL"), card("c", "Brighton")];
    const { result } = renderHook(() => useOffices(therapists, true), { wrapper: withClient() });
    await waitFor(() => expect(result.current.officeOf(therapists[0]!)).toEqual({ postcode: "BN1 1EL", cost: "£70" }));
    expect(office.mock.calls.map(([slug, location]) => [slug, location])).toEqual([
      ["a", "BRIGHTON BN1"],
      ["b", "BN3 2FL"],
      ["c", "BRIGHTON"],
    ]);
    await waitFor(() => expect(result.current.officeOf(therapists[2]!)).toEqual({}));
  });

  it("is pending for a card until its answer comes or its lookup fails, and has no answer after a failure", async () => {
    let answer = (_: object) => {};
    vi.spyOn(api, "office").mockImplementation((slug) => {
      if (slug === "failed") return Promise.reject(new ApiError(502, "UKCP's search isn't responding."));
      return new Promise((resolve) => (answer = resolve));
    });
    const therapists = [card("jo", "Brighton BN1"), card("failed", "Hove BN3")];
    const { result } = renderHook(() => useOffices(therapists, true), { wrapper: withClient() });
    await waitFor(() => expect(result.current.pending(therapists[1]!)).toBe(false));
    expect(result.current.officeOf(therapists[1]!)).toBeUndefined();
    expect(result.current.pending(therapists[0]!)).toBe(true);
    answer({ postcode: "BN1 1EL" });
    await waitFor(() => expect(result.current.pending(therapists[0]!)).toBe(false));
  });

  it("asks nothing of a card naming no place, nor of any while it isn't enabled", async () => {
    const office = vi.spyOn(api, "office").mockResolvedValue({});
    const wrapper = withClient();
    const nameless = renderHook(() => useOffices([card("a"), card("b", " "), card("c", "BN")], true), { wrapper });
    const off = renderHook(() => useOffices([card("d", "Brighton BN1")], false), { wrapper });
    expect(nameless.result.current.pending(card("a"))).toBe(false);
    expect(off.result.current.pending(card("d", "Brighton BN1"))).toBe(false);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(office).not.toHaveBeenCalled();
  });

  it("stops asking once nothing shows the card", async () => {
    let signal: AbortSignal | undefined;
    vi.spyOn(api, "office").mockImplementation((_slug, _location, given) => {
      signal = given;
      return new Promise(() => {});
    });
    const { unmount } = renderHook(() => useOffices([card("jo", "Brighton BN1")], true), { wrapper: withClient() });
    await waitFor(() => expect(signal).toBeDefined());
    unmount();
    await waitFor(() => expect(signal?.aborted).toBe(true));
  });
});
