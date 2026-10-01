// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, renderHook, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes, type Location } from "react-router";
import { afterEach, describe, expect, it, onTestFinished, vi } from "vitest";
import { emptyParams, readParams } from "@shared/query";
import type { Profile, TherapistCard } from "@shared/types";
import { TooltipProvider } from "@/components/ui/tooltip";
import { api, ApiError } from "@/lib/api";
import { listed } from "@/lib/listed.testing";
import { useResults } from "@/search/useResults";
import { createShortlistStore, type ShortlistCard, type ShortlistStore } from "@/shortlist/store";
import { ShortlistContext } from "@/shortlist/useShortlist";
import { ProfilePage } from "./ProfilePage";

/** Set by a test whose office maps' code can't be fetched. */
const mapChunk = vi.hoisted(() => ({ fails: false }));

// An office's map as it is, until its code can't be fetched; then it throws where it would draw, as React does with a lazy
// component whose import failed.
vi.mock("./ProfileMap", async (importOriginal) => {
  const { createElement } = await import("react");
  const { default: ProfileMap } = await importOriginal<typeof import("./ProfileMap")>();
  return {
    default: (props: Parameters<typeof ProfileMap>[0]) => {
      if (mapChunk.fails) throw new TypeError("Failed to fetch dynamically imported module");
      return createElement(ProfileMap, props);
    },
  };
});

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

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  mapChunk.fails = false;
});

/** Stands in for the IntersectionObserver jsdom lacks, and returns what reports the header clipped at the top, as its scroller does once it sticks. */
function stickable() {
  const reports: IntersectionObserverCallback[] = [];
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      constructor(callback: IntersectionObserverCallback) {
        reports.push(callback);
      }
      observe() {}
      disconnect() {}
    },
  );
  const clipped = { boundingClientRect: { top: -1 }, intersectionRect: { top: 0 } } as IntersectionObserverEntry;
  return () => act(() => reports.at(-1)!([clipped], {} as IntersectionObserver));
}

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

  it("tries a failed profile again, and hands the keyboard to the therapist's name once it arrives", async () => {
    renderAt(["/therapist/Test-ABCDEFGH"], new ApiError(503, "UKCP answered 503."));
    const retry = await screen.findByRole("button", { name: "Try again" });
    vi.mocked(api.profile).mockResolvedValue(PROFILE);
    act(() => retry.focus());
    fireEvent.click(retry);
    const name = await screen.findByRole("heading", { name: "Test Therapist" });
    await waitFor(() => expect(document.activeElement).toBe(name));
  });
});

describe("ProfilePage's header", () => {
  it("names no one to screen readers until the profile arrives", async () => {
    renderAt(["/therapist/Test-ABCDEFGH"]);
    expect(screen.queryAllByRole("heading")).toEqual([]);
    await screen.findByRole("heading", { name: "Test Therapist" });
  });

  it("lists the profile's email among the ways to reach them", async () => {
    renderAt(["/therapist/Test-ABCDEFGH"], { ...PROFILE, email: "test@example.com" });
    const email = await screen.findByRole("link", { name: "Email: test@example.com" });
    expect(email.closest("header")).not.toBeNull();
  });

  it("marks itself stuck once its scroller clips it at the top, for its photo to shrink", async () => {
    const stick = stickable();
    renderAt(["/therapist/Test-ABCDEFGH"]);
    const header = (await screen.findByRole("heading", { name: "Test Therapist" })).closest("header");
    expect(header?.dataset.stuck).toBeUndefined();
    stick();
    expect(header?.dataset.stuck).toBe("true");
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

describe("ProfilePage's status track", () => {
  const THERAPIST: ShortlistCard = { slug: "Test-ABCDEFGH", name: "Test Therapist", initials: "TT", tags: [] };
  const track = () => screen.findByRole("list", { name: "Steps with Test Therapist" });
  const step = (steps: HTMLElement) => steps.querySelector("[aria-current=step]")?.textContent;

  it("follows the header, outside it, while the therapist is shortlisted", async () => {
    const store = createShortlistStore(null);
    store.add(THERAPIST, { status: "contacted" });
    renderAt(["/therapist/Test-ABCDEFGH"], PROFILE, { store });
    const steps = await track();
    const header = screen.getByRole("heading", { name: "Test Therapist" }).closest("header")!;
    expect(header.contains(steps)).toBe(false);
    expect(header.compareDocumentPosition(steps) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(step(steps)).toBe("Contacted");
  });

  it("shows none for a therapist not shortlisted, and one at To contact once the bookmark adds them", async () => {
    renderAt(["/therapist/Test-ABCDEFGH"]);
    await screen.findByRole("heading", { name: "Test Therapist" });
    expect(screen.queryByRole("list", { name: "Steps with Test Therapist" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Add Test Therapist to your shortlist" }));
    expect(step(await track())).toBe("To contact");
  });

  it("comes and goes without moving what the visitor reads below it, once the header has stuck", async () => {
    const stick = stickable();
    const slotted = () => document.querySelector("article > .min-h-11") !== null;
    // jsdom lays nothing out, so the columns are placed as a browser would: lower by the track's slot (its 44 px and space-y-8's 32) while it is there.
    vi.spyOn(HTMLElement.prototype, "offsetTop", "get").mockImplementation(() => (slotted() ? 376 : 300));
    // Nor does it scroll: the page's scroller, which a browser keeps from going past the page's end, 76 px further while the slot is there.
    let scrolled = 200;
    const page = {
      get scrollTop() {
        return Math.min(scrolled, slotted() ? 576 : 500);
      },
      set scrollTop(to: number) {
        scrolled = to;
      },
    };
    Object.defineProperty(document, "scrollingElement", { configurable: true, value: page });
    onTestFinished(() => void Reflect.deleteProperty(document, "scrollingElement"));
    renderAt(["/therapist/Test-ABCDEFGH"]);
    await screen.findByRole("heading", { name: "Test Therapist" });
    const add = () => fireEvent.click(screen.getByRole("button", { name: "Add Test Therapist to your shortlist" }));
    const remove = () => fireEvent.click(screen.getByRole("button", { name: "Remove Test Therapist from your shortlist" }));
    // At the top of the profile, the track comes and goes in view, as the visitor asked.
    add();
    await track();
    expect(page.scrollTop).toBe(200);
    remove();
    expect(page.scrollTop).toBe(200);
    stick();
    page.scrollTop = 300;
    add();
    expect(page.scrollTop).toBe(376);
    remove();
    expect(page.scrollTop).toBe(300);
    // At the page's end, where the browser has already pulled the scroll back by the time the slot has gone.
    page.scrollTop = 500;
    add();
    expect(page.scrollTop).toBe(576);
    remove();
    expect(page.scrollTop).toBe(500);
  });

  it("says each change of status", async () => {
    const store = createShortlistStore(null);
    store.add(THERAPIST);
    renderAt(["/therapist/Test-ABCDEFGH"], PROFILE, { store });
    await track();
    fireEvent.click(screen.getByRole("button", { name: "Mark contacted, Test Therapist" }));
    expect(screen.getByText("Test Therapist: Contacted.").getAttribute("aria-live")).toBe("polite");
  });

  it("gives focus to the bookmark once the menu removes the therapist, and the bookmark brings them back as they were", async () => {
    const store = createShortlistStore(null);
    store.add(THERAPIST, { status: "consultation" });
    renderAt(["/therapist/Test-ABCDEFGH"], PROFILE, { store });
    await track();
    // As a keyboard opens it, since jsdom's pointer events lack the button Radix checks for.
    fireEvent.keyDown(screen.getByRole("button", { name: "Status of Test Therapist: consultation" }), { key: "Enter" });
    fireEvent.click(screen.getByRole("menuitem", { name: "Remove from shortlist" }));
    expect(store.has("Test-ABCDEFGH")).toBe(false);
    expect(screen.queryByRole("list", { name: "Steps with Test Therapist" })).toBeNull();
    const bookmark = screen.getByRole("button", { name: "Add Test Therapist to your shortlist" });
    // Radix moves focus a macrotask after its menu goes.
    await act(() => new Promise((resolve) => setTimeout(resolve, 0)));
    expect(document.activeElement).toBe(bookmark);
    fireEvent.click(bookmark);
    expect(step(await track())).toBe("Consultation");
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

  describe("special interests", () => {
    const STOCK =
      "Like all UKCP registered psychotherapists and psychotherapeutic counsellors I can work with a wide range of issues, but here are some areas in which I have a special interest or additional experience.";
    const INTERESTED: Profile = {
      ...PROFILE,
      about: [
        { heading: "Special Interests", paragraphs: [STOCK], items: [], details: [{ title: "Trauma", text: "Trauma text." }, { title: "Gender", text: "" }] },
        section("What I can help with", ["Anxiety", "Trauma"]),
      ],
    };

    it("lists them first among what the therapist can help with, each above what they wrote of it, with nothing to open", async () => {
      renderAt(["/therapist/Test-ABCDEFGH"], INTERESTED);
      const help = (await screen.findByRole("heading", { level: 2, name: "What I can help with" })).parentElement;
      expect([...(help?.querySelectorAll("h3") ?? [])].map((h) => h.textContent)).toEqual(["Special interests", "Other areas"]);
      expect(screen.queryByRole("heading", { level: 2, name: "Special Interests" })).toBeNull();
      expect(screen.getByText("Trauma text.").closest("dl")?.textContent).toContain("Trauma");
      expect(screen.queryByRole("button", { name: "Trauma" })).toBeNull();
      expect(screen.getAllByText("Trauma")).toHaveLength(1);
      expect(screen.getByText("Gender").closest("dl")).toBeNull();
      expect(screen.queryByText(STOCK)).toBeNull();
    });

    it("has no other areas where every tag the therapist can help with is a special interest", async () => {
      renderAt(["/therapist/Test-ABCDEFGH"], { ...INTERESTED, about: [INTERESTED.about[0]!, section("What I can help with", ["Trauma"])] });
      await screen.findByRole("heading", { level: 3, name: "Special interests" });
      expect(screen.queryByRole("heading", { name: "Other areas" })).toBeNull();
    });

    it("marks the matches that are special interests", async () => {
      renderAt(["/", overSearch("?HelpWith=Anxiety&HelpWithAdvanced=Trauma")], INTERESTED);
      const matches = (await screen.findByRole("heading", { name: "Matches your search" })).parentElement;
      expect([...(matches?.querySelectorAll("li") ?? [])].map((li) => li.textContent)).toEqual(["Trauma, a special interest", "Anxiety"]);
    });
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

  it("leaves a note in an office's map, and the rest of its card, when the map's code can't be fetched", async () => {
    // React reports the error it caught to the console.
    vi.spyOn(console, "error").mockImplementation(() => {});
    mapChunk.fails = true;
    vi.spyOn(api, "place").mockResolvedValue({ found: true, kind: "place", candidates: [{ lat: 51.52, lng: -0.15 }] });
    const london = { ...office("London Office", "£90 per session"), address: ["10 Harley Street", "London W1G 9PF"] };
    renderAt(["/therapist/Test-ABCDEFGH"], { ...PROFILE, offices: [london] });
    const map = await screen.findByRole("region", { name: "Map of London Office" });
    expect(await within(map).findByText("The map couldn't load.")).toBeTruthy();
    expect(map.closest("[data-slot=card]")?.textContent).toContain("£90 per session");
  });

  it("links each office's name to its map", async () => {
    const mapped = { ...office("Brighton Office", "£70"), mapUrl: "https://maps.example/?q=Brighton" };
    renderAt(["/therapist/Test-ABCDEFGH"], { ...PROFILE, offices: [mapped, office("London Office", "£70")] });
    const link = await screen.findByRole("link", { name: "Brighton Office, map (opens in a new tab)" });
    expect(link.getAttribute("href")).toBe("https://maps.example/?q=Brighton");
    screen.getByText("London Office");
    expect(screen.queryByRole("link", { name: /London Office/ })).toBeNull();
  });

  it("puts first the office the visitor's search measured to, marked with the distance its card gave", async () => {
    vi.spyOn(api, "place").mockResolvedValue({ found: false, reason: "not-found" });
    const card: TherapistCard = { slug: "Test-ABCDEFGH", name: "Test Therapist", initials: "TT", location: "Brighton BN1", distance: "0.1 miles from Brighton", tags: [] };
    vi.spyOn(api, "search").mockResolvedValue(listed({ total: 1, from: 1, to: 1, notices: [], therapists: [card] }));
    const client = newClient();
    const params = readParams(new URLSearchParams("Location=Brighton"));
    const search = renderHook(() => useResults(params), { wrapper: ({ children }) => <QueryClientProvider client={client}>{children}</QueryClientProvider> });
    await waitFor(() => expect(search.result.current.therapists).toHaveLength(1));
    const london = { ...office("London Office", "£90"), isMain: true, address: ["10 Harley Street", "London W1G 9PF"] };
    const brighton = { ...office("Brighton Office", "£70"), address: ["28 New Road", "Brighton BN1 1UG"] };
    renderAt(["/", overSearch("?Location=Brighton")], { ...PROFILE, offices: [london, brighton] }, { client });
    const first = await screen.findByText("Brighton Office");
    expect(first.compareDocumentPosition(screen.getByText("London Office")) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    const [mark, ...others] = screen.getAllByText(", the office nearest your search");
    expect(others).toEqual([]);
    expect(mark?.parentElement?.textContent).toBe("0.1 miles from Brighton, the office nearest your search");
    expect(mark?.closest("[data-slot=card]")?.textContent).toContain("Brighton Office");
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
