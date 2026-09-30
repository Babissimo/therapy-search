// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Profile } from "@shared/types";
import { TooltipProvider } from "@/components/ui/tooltip";
import { api } from "@/lib/api";
import { listed } from "@/lib/listed.testing";
import { createShortlistStore } from "@/shortlist/store";
import { ShortlistContext } from "@/shortlist/useShortlist";
import { AppRoutes } from "./App";

// Leaflet draws nothing under jsdom; the map is tested on its own.
vi.mock("@/search/map/MapPane", () => ({ default: () => null }));

const PROFILE: Profile = { slug: "Jo-ABCDEFGH", name: "Jo Bloggs", initials: "JB", languages: [], emailInContact: false, social: [], about: [], practical: [], offices: [] };

function Url() {
  const { pathname, search } = useLocation();
  return <output data-testid="url">{pathname + search}</output>;
}

function renderAt(url: string, shortlist = createShortlistStore(null)) {
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <ShortlistContext.Provider value={shortlist}>
        <TooltipProvider>
          <MemoryRouter initialEntries={[url]}>
            <AppRoutes />
            <Url />
          </MemoryRouter>
        </TooltipProvider>
      </ShortlistContext.Provider>
    </QueryClientProvider>,
  );
  return shortlist;
}

beforeEach(() => {
  vi.stubGlobal("matchMedia", (query: string) => ({ matches: query === "(min-width: 64rem)", media: query, addEventListener() {}, removeEventListener() {} }));
  vi.spyOn(api, "search").mockResolvedValue(listed({ total: 1, from: 1, to: 1, notices: [], therapists: [{ slug: PROFILE.slug, name: PROFILE.name, initials: "JB", tags: [] }] }));
  vi.spyOn(api, "profile").mockResolvedValue(PROFILE);
  vi.spyOn(window, "scrollTo").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("AppRoutes", () => {
  it("opens a profile from the search in a drawer over it, and closing it goes back to the search as it was", async () => {
    renderAt("/?Location=Leeds");
    const card = await screen.findByRole("link", { name: "Jo Bloggs" });
    card.focus();
    fireEvent.click(card);
    const drawer = await screen.findByRole("dialog", { name: "Therapist profile" });
    expect(await within(drawer).findByRole("heading", { name: "Jo Bloggs" })).toBeTruthy();
    expect(screen.getByTestId("url").textContent).toBe("/therapist/Jo-ABCDEFGH");
    // The search is still there beneath, not loaded again.
    expect(screen.getByRole("region", { name: "Results and shortlist", hidden: true })).toBeTruthy();
    fireEvent.click(within(drawer).getByRole("button", { name: "Close" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(screen.getByTestId("url").textContent).toBe("/?Location=Leeds");
    expect(api.search).toHaveBeenCalledOnce();
    // The keyboard carries on from the card that opened it.
    await waitFor(() => expect(document.activeElement).toBe(card));
  });

  it("opens a profile from the online list in a drawer over it, and closing it goes back to the list", async () => {
    renderAt("/online?Languages=Greek");
    expect(screen.getByRole("link", { name: "Online" }).getAttribute("aria-current")).toBe("page");
    fireEvent.click(await screen.findByRole("link", { name: "Jo Bloggs" }));
    const drawer = await screen.findByRole("dialog", { name: "Therapist profile" });
    fireEvent.click(within(drawer).getByRole("button", { name: "Close" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(screen.getByTestId("url").textContent).toBe("/online?Languages=Greek");
    expect(api.search).toHaveBeenCalledOnce();
  });

  it("shows a profile reached directly as a page of its own", async () => {
    renderAt("/therapist/Jo-ABCDEFGH");
    expect(await screen.findByRole("heading", { name: "Jo Bloggs" })).toBeTruthy();
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByRole("link", { name: "Search for a therapist" })).toBeTruthy();
  });

  it("shortlists a therapist from the search, and opens them from the shortlist's tab over it", async () => {
    renderAt("/?Location=Leeds");
    fireEvent.click(await screen.findByRole("button", { name: "Add Jo Bloggs to your shortlist" }));
    fireEvent.mouseDown(screen.getByRole("tab", { name: "Shortlist, 1 therapist" }));
    fireEvent.click(within(screen.getByRole("tabpanel", { name: /^Shortlist/ })).getByRole("link", { name: "Jo Bloggs" }));
    const drawer = await screen.findByRole("dialog", { name: "Therapist profile" });
    // The profile's header carries the bookmark too, beside the drawer's close button.
    const header = (await within(drawer).findByRole("heading", { name: "Jo Bloggs" })).closest("header")!;
    within(header).getByRole("button", { name: "Remove Jo Bloggs from your shortlist" });
    fireEvent.click(within(header).getByRole("button", { name: "Close" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(screen.getByTestId("url").textContent).toBe("/?Location=Leeds");
    expect(screen.getByRole("tab", { name: /^Shortlist/ }).getAttribute("aria-selected")).toBe("true");
  });

  it("brings a shortlisted therapist's card up to date from a search", async () => {
    const shortlist = createShortlistStore(null);
    shortlist.add({ slug: PROFILE.slug, name: "Jo Old-Name", initials: "JO", tags: [] });
    renderAt("/?Location=Leeds", shortlist);
    await screen.findByRole("link", { name: "Jo Bloggs" });
    expect(shortlist.get()[0]?.card.name).toBe("Jo Bloggs");
  });
});
