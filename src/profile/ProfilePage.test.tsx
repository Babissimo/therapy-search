// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, renderHook, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes, type Location } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { emptyParams } from "@shared/query";
import type { Profile, TherapistCard } from "@shared/types";
import { TooltipProvider } from "@/components/ui/tooltip";
import { api, ApiError } from "@/lib/api";
import { listed } from "@/lib/listed.testing";
import { useResults } from "@/search/useResults";
import { createShortlistStore, type ShortlistStore } from "@/shortlist/store";
import { ShortlistContext } from "@/shortlist/useShortlist";
import { ProfilePage } from "./ProfilePage";

const PROFILE: Profile = { slug: "Test-ABCDEFGH", name: "Test Therapist", initials: "TT", languages: [], emailInContact: false, social: [], about: [], practical: [], offices: [] };

const newClient = () => new QueryClient({ defaultOptions: { queries: { retry: false } } });

type Setup = { store?: ShortlistStore; client?: QueryClient };

function renderAt(entries: (string | Partial<Location>)[], result: Profile | ApiError = PROFILE, { store = createShortlistStore(null), client = newClient() }: Setup = {}) {
  const profile = vi.spyOn(api, "profile");
  if (result instanceof ApiError) profile.mockRejectedValue(result);
  else profile.mockResolvedValue(result);
  // Current Chrome's scrollTo returns a promise.
  vi.spyOn(window, "scrollTo").mockImplementation(async () => {});
  render(
    <QueryClientProvider client={client}>
      <ShortlistContext.Provider value={store}>
        <TooltipProvider>
          <MemoryRouter initialEntries={entries} initialIndex={entries.length - 1}>
            <Routes>
              <Route path="/" element={<p>Search page</p>} />
              <Route path="/therapist/:slug" element={<ProfilePage slug="Test-ABCDEFGH" />} />
            </Routes>
          </MemoryRouter>
        </TooltipProvider>
      </ShortlistContext.Provider>
    </QueryClientProvider>,
  );
}

afterEach(() => vi.restoreAllMocks());

describe("ProfilePage's way back", () => {
  it("goes back to the visitor's search", async () => {
    renderAt(["/?Location=Leeds", "/therapist/Test-ABCDEFGH"]);
    await screen.findByRole("heading", { name: "Test Therapist" });
    fireEvent.click(screen.getByRole("button", { name: "Back to results" }));
    await screen.findByText("Search page");
  });

  it("offers a new search to a visitor who arrived on the profile directly", async () => {
    renderAt(["/therapist/Test-ABCDEFGH"]);
    await screen.findByRole("heading", { name: "Test Therapist" });
    expect(screen.getByRole("link", { name: "Search for a therapist" }).getAttribute("href")).toBe("/");
  });

  it("is there while the profile loads", () => {
    renderAt(["/?Location=Leeds", "/therapist/Test-ABCDEFGH"]);
    screen.getByRole("button", { name: "Back to results" });
  });

  it("is there when the profile can't be shown, beside the reason", async () => {
    renderAt(["/?Location=Leeds", "/therapist/Test-ABCDEFGH"], new ApiError(404, "This profile isn't on UKCP any more."));
    await screen.findByText("This profile isn't on UKCP any more.");
    fireEvent.click(screen.getByRole("button", { name: "Back to results" }));
    await screen.findByText("Search page");
  });
});

describe("ProfilePage's header", () => {
  it("lists the profile's email among the ways to reach them", async () => {
    renderAt(["/therapist/Test-ABCDEFGH"], { ...PROFILE, email: "test@example.com" });
    const email = await screen.findByRole("link", { name: "Email: test@example.com" });
    expect(email.closest("header")).not.toBeNull();
  });
});

describe("ProfilePage's bookmark", () => {
  const CARD: TherapistCard = { slug: "Test-ABCDEFGH", name: "Test Therapist", initials: "TT", location: "Testtown", sessionTypes: "Remote", summary: "Summary text.", tags: ["Anxiety"] };
  const add = () => fireEvent.click(screen.getByRole("button", { name: "Add Test Therapist to your shortlist" }));
  const remove = () => fireEvent.click(screen.getByRole("button", { name: "Remove Test Therapist from your shortlist" }));

  it("shortlists the therapist from the header with what it shows of them, where no search showed their card", async () => {
    const store = createShortlistStore(null);
    renderAt(["/therapist/Test-ABCDEFGH"], { ...PROFILE, location: "Testtown", photoUrl: "https://example.invalid/photo.jpg" }, { store });
    await screen.findByRole("heading", { name: "Test Therapist" });
    expect(screen.getByRole("button", { name: "Add Test Therapist to your shortlist" }).closest("header")).not.toBeNull();
    add();
    expect(store.get().map((entry) => entry.card)).toEqual([{ slug: "Test-ABCDEFGH", name: "Test Therapist", initials: "TT", photoUrl: "https://example.invalid/photo.jpg", location: "Testtown", tags: [] }]);
    remove();
    expect(store.get()).toEqual([]);
  });

  it("shortlists the card the visitor's search showed, which says more than the header", async () => {
    const client = newClient();
    vi.spyOn(api, "search").mockResolvedValue(listed({ total: 1, from: 1, to: 1, notices: [], therapists: [{ ...CARD, distance: "1 mile from Leeds" }] }));
    const search = renderHook(() => useResults(emptyParams()), { wrapper: ({ children }) => <QueryClientProvider client={client}>{children}</QueryClientProvider> });
    await waitFor(() => expect(search.result.current.therapists).toHaveLength(1));
    const store = createShortlistStore(null);
    renderAt(["/", { pathname: "/therapist/Test-ABCDEFGH", state: { background: { pathname: "/", search: "" } } }], PROFILE, { store, client });
    await screen.findByRole("heading", { name: "Test Therapist" });
    add();
    expect(store.get().map((entry) => entry.card)).toEqual([CARD]);
  });
});

describe("ProfilePage's content", () => {
  const section = (heading: string, items: string[]) => ({ heading, paragraphs: [], items, details: [] });
  const office = (name: string, cost: string) => ({ name, isMain: false, address: [], cost });
  const RICH: Profile = {
    ...PROFILE,
    about: [section("What I can help with", ["Anxiety", "Depression"])],
    practical: [section("Types of sessions", ["Online Therapy"])],
    offices: [office("Brighton Office", "£70 per session"), office("London Office", "£90 per session")],
  };
  // A profile opened over a search carries that search's location.
  const overSearch = (search: string) => ({ pathname: "/therapist/Test-ABCDEFGH", state: { background: { pathname: "/", search } } });

  it("marks the tags the visitor searched for, and gathers them at the top", async () => {
    renderAt(["/", overSearch("?HelpWith=Anxiety&TypesOfSession=Online+Therapy")], RICH);
    const matches = (await screen.findByRole("heading", { name: "Matches your search" })).parentElement;
    expect([...(matches?.querySelectorAll("li") ?? [])].map((li) => li.textContent)).toEqual(["Anxiety", "Online Therapy"]);
    // Each is also marked where the profile lists it, where no heading says it matches.
    expect(screen.getAllByText(", in your search")).toHaveLength(2);
    expect(screen.getByText("Depression").textContent).toBe("Depression");
  });

  it("marks nothing on a profile opened directly", async () => {
    renderAt(["/therapist/Test-ABCDEFGH"], RICH);
    await screen.findByRole("heading", { name: "Test Therapist" });
    expect(screen.queryByRole("heading", { name: "Matches your search" })).toBeNull();
    expect(screen.queryByText(", in your search")).toBeNull();
  });

  it("gives each office's fees in that office's card", async () => {
    renderAt(["/therapist/Test-ABCDEFGH"], RICH);
    const card = (await screen.findByText("£90 per session")).closest("[data-slot=card]");
    expect(card?.textContent).toContain("London Office");
    expect(card?.textContent).not.toContain("£70 per session");
  });

  it("puts the long sections first and the short ones beside or after them", async () => {
    const prose = (heading: string) => ({ heading, paragraphs: ["Text"], items: [], details: [] });
    renderAt(["/therapist/Test-ABCDEFGH"], { ...PROFILE, about: [prose("My Approach"), section("I work with", ["Adults"])], practical: [section("UKCP College", ["Test College"])] });
    const approach = await screen.findByRole("heading", { name: "My Approach" });
    expect(approach.closest("aside")).toBeNull();
    for (const name of ["I work with", "UKCP College"]) {
      const heading = screen.getByRole("heading", { name });
      expect(heading.closest("aside")).not.toBeNull();
      expect(approach.compareDocumentPosition(heading) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    }
  });

  it("lets a tag too long for its column wrap onto another line", async () => {
    const college = "College of Family Couple and Systemic Psychotherapy (CFCSP)";
    renderAt(["/therapist/Test-ABCDEFGH"], { ...PROFILE, practical: [section("UKCP College", [college])] });
    // jsdom lays nothing out, so this checks the tag gives up the badge's single line rather than measuring it.
    expect((await screen.findByText(college)).className).toContain("whitespace-normal");
  });

  it("links each office's name to its map", async () => {
    const mapped = { ...office("Brighton Office", "£70"), mapUrl: "https://maps.example/?q=Brighton" };
    renderAt(["/therapist/Test-ABCDEFGH"], { ...PROFILE, offices: [mapped, office("London Office", "£70")] });
    const link = await screen.findByRole("link", { name: "Brighton Office, map" });
    expect(link.getAttribute("href")).toBe("https://maps.example/?q=Brighton");
    screen.getByText("London Office");
    expect(screen.queryByRole("link", { name: /London Office/ })).toBeNull();
  });

  it("looks an office up once at home, and abroad until one of its texts is found in its country", async () => {
    const place = vi.spyOn(api, "place").mockImplementation(async (text) =>
      text === "BERLIN 12689" ? { found: true, kind: "place", candidates: [{ lat: 52.57, lng: 13.57 }] } : { found: false, reason: "not-found" },
    );
    const london = { ...office("London Office", "£70"), address: ["Fitzrovia", "London W1W", "United Kingdom (UK)"] };
    const berlin = { ...office("Berlin Office", "£70"), address: ["Belzinger Ring", "Berlin 12689", "Germany"] };
    renderAt(["/therapist/Test-ABCDEFGH"], { ...PROFILE, offices: [london, berlin] });
    await screen.findByRole("region", { name: "Map of Berlin Office" });
    expect(place.mock.calls).toEqual([
      ["LONDON W1W", { outsideUK: false }],
      ["BELZINGER RING BERLIN 12689", { centre: true, country: "de" }],
      ["BERLIN 12689", { centre: true, country: "de" }],
    ]);
  });
});
