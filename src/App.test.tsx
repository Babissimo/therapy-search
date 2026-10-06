// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, useLocation, useNavigate } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Profile } from "@shared/types";
import { TooltipProvider } from "@/components/ui/tooltip";
import { api } from "@/lib/api";
import { listed } from "@/lib/listed.testing";
import { createShortlistStore } from "@/shortlist/store";
import { ShortlistContext } from "@/shortlist/useShortlist";
import { App, AppRoutes } from "./App";

// Leaflet draws nothing under jsdom; the map is tested on its own.
vi.mock("@/search/map/MapPane", () => ({ default: () => null }));

// The shortlist's chunk is here at once, so opening its tab shows it in the same step (see LazyShortlistTab.test.tsx).
vi.mock("@/shortlist/LazyShortlistTab", async () => ({
  LazyShortlistTab: (await import("@/shortlist/ShortlistTab")).ShortlistTab,
  usePreloadShortlistTab: () => {},
}));

const PROFILE: Profile = { slug: "Jo-ABCDEFGH", name: "Jo Bloggs", initials: "JB", languages: [], emailInContact: false, social: [], about: [], practical: [], offices: [] };

function Url() {
  const { pathname, search } = useLocation();
  return <output data-testid="url">{pathname + search}</output>;
}

/** Moves through the history by `delta` entries, as the browser's Back and Forward do. */
let travel: (delta: number) => void;

function Travel() {
  const navigate = useNavigate();
  travel = (delta) => act(() => void navigate(delta));
  return null;
}

/** The app at `url`, or at the last of several, with those before it to go Back to. */
function renderAt(url: string | string[], shortlist = createShortlistStore(null)) {
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <ShortlistContext.Provider value={shortlist}>
        <TooltipProvider>
          <MemoryRouter initialEntries={[url].flat()}>
            <AppRoutes />
            <Url />
            <Travel />
          </MemoryRouter>
        </TooltipProvider>
      </ShortlistContext.Provider>
    </QueryClientProvider>,
  );
  return shortlist;
}

beforeEach(() => {
  const wide = (query: string) => query === "(min-width: 64rem) and (min-height: 31rem)";
  vi.stubGlobal("matchMedia", (query: string) => ({ matches: wide(query), media: query, addEventListener() {}, removeEventListener() {} }));
  vi.spyOn(api, "search").mockResolvedValue(listed({ total: 1, from: 1, to: 1, notices: [], therapists: [{ slug: PROFILE.slug, name: PROFILE.name, initials: "JB", tags: [] }] }));
  vi.spyOn(api, "profile").mockResolvedValue(PROFILE);
  vi.spyOn(window, "scrollTo").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("App", () => {
  it("reads the page from after the #, which the browser never sends to the server", () => {
    window.history.replaceState(null, "", "/#/nowhere");
    render(<App />);
    expect(screen.getByText(/There's no page here/)).toBeTruthy();
    window.history.replaceState(null, "", "/");
  });
});

describe("AppRoutes", () => {
  it("opens a profile from the search in a drawer over it, and closing it goes back to the search as it was", async () => {
    renderAt("/?Location=Leeds");
    const card = await screen.findByRole("link", { name: "Jo Bloggs" });
    card.focus();
    fireEvent.click(card);
    const drawer = await screen.findByRole("dialog", { name: "Jo Bloggs" });
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

  it("marks the drawer to print alone, in place of the search beneath it, and the page while the drawer is there", async () => {
    renderAt("/?Location=Leeds");
    fireEvent.click(await screen.findByRole("link", { name: "Jo Bloggs" }));
    const drawer = await screen.findByRole("dialog", { name: "Jo Bloggs" });
    expect(drawer.hasAttribute("data-print-alone")).toBe(true);
    // Print hides the body's other children, which the drawer must not be among.
    expect(drawer.parentElement).toBe(document.body);
    expect(document.documentElement.hasAttribute("data-print-alone-shown")).toBe(true);
    fireEvent.click(within(drawer).getByRole("button", { name: "Close" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(document.documentElement.hasAttribute("data-print-alone-shown")).toBe(false);
  });

  it("names the drawer, and the page while it is open, after the therapist", async () => {
    let answer = (_: Profile) => {};
    vi.mocked(api.profile).mockImplementation(() => new Promise((resolve) => (answer = resolve)));
    renderAt("/?Location=Leeds");
    fireEvent.click(await screen.findByRole("link", { name: "Jo Bloggs" }));
    await waitFor(() => expect(document.title).toBe("1 therapist near Leeds - Find a UKCP therapist (unofficial)"));
    const drawer = await screen.findByRole("dialog", { name: "Therapist profile" });
    act(() => answer(PROFILE));
    await waitFor(() => expect(drawer.getAttribute("aria-labelledby") && document.getElementById(drawer.getAttribute("aria-labelledby")!)?.textContent).toBe("Jo Bloggs"));
    expect(document.title).toBe("Jo Bloggs - Find a UKCP therapist (unofficial)");
    fireEvent.click(within(drawer).getByRole("button", { name: "Close" }));
    await waitFor(() => expect(document.title).toBe("1 therapist near Leeds - Find a UKCP therapist (unofficial)"));
  });

  it("names the page after a drawer that Forward opens again, though the search beneath was drawn afresh while it was shut", async () => {
    const title = (name: string) => `${name} - Find a UKCP therapist (unofficial)`;
    renderAt(["/online?Languages=Greek", "/?Location=Leeds"]);
    fireEvent.click(await screen.findByRole("link", { name: "Jo Bloggs" }));
    const drawer = await screen.findByRole("dialog", { name: "Jo Bloggs" });
    await waitFor(() => expect(document.title).toBe(title("Jo Bloggs")));
    fireEvent.click(within(drawer).getByRole("button", { name: "Close" }));
    await waitFor(() => expect(document.title).toBe(title("1 therapist near Leeds")));
    // Online and Near me are drawn by different views, so each Back or Forward between them draws the search afresh.
    travel(-1);
    await waitFor(() => expect(document.title).toBe(title("1 therapist working online or by phone")));
    travel(1);
    await waitFor(() => expect(document.title).toBe(title("1 therapist near Leeds")));
    travel(1);
    expect(await screen.findByRole("dialog", { name: "Jo Bloggs" })).toBeTruthy();
    expect(document.title).toBe(title("Jo Bloggs"));
  });

  it("names a profile's own page after the therapist", async () => {
    renderAt("/therapist/Jo-ABCDEFGH");
    await waitFor(() => expect(document.title).toBe("Jo Bloggs - Find a UKCP therapist (unofficial)"));
  });

  it("hands the keyboard back to whatever opened a profile, opened before from elsewhere or not", async () => {
    renderAt("/?Location=Leeds");
    const card = await screen.findByRole("link", { name: "Jo Bloggs" });
    card.focus();
    fireEvent.click(card);
    fireEvent.click(within(await screen.findByRole("dialog", { name: "Jo Bloggs" })).getByRole("button", { name: "Close" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    fireEvent.click(screen.getByRole("button", { name: "Add Jo Bloggs to your shortlist" }));
    fireEvent.mouseDown(screen.getByRole("tab", { name: "Shortlist, 1 therapist" }));
    const entry = within(screen.getByRole("tabpanel", { name: /^Shortlist/ })).getByRole("link", { name: "Jo Bloggs" });
    entry.focus();
    fireEvent.click(entry);
    fireEvent.click(within(await screen.findByRole("dialog", { name: "Jo Bloggs" })).getByRole("button", { name: "Close" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(entry));
  });

  it("opens a profile from the online list in a drawer over it, and closing it goes back to the list", async () => {
    renderAt("/online?Languages=Greek");
    expect(screen.getByRole("link", { name: "Online" }).getAttribute("aria-current")).toBe("page");
    fireEvent.click(await screen.findByRole("link", { name: "Jo Bloggs" }));
    const drawer = await screen.findByRole("dialog", { name: "Jo Bloggs" });
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

  it("opens a profile over the search again where its address is entered afresh, which leaves its entry without the search", async () => {
    renderAt("/?Location=Leeds");
    fireEvent.click(await screen.findByRole("link", { name: "Jo Bloggs" }));
    await screen.findByRole("dialog", { name: "Jo Bloggs" });
    cleanup();
    // The address entered again, as a new page in the same tab, with the search still the entry before it.
    renderAt(["/?Location=Leeds", "/therapist/Jo-ABCDEFGH"]);
    const drawer = await screen.findByRole("dialog", { name: "Jo Bloggs" });
    expect(screen.getByRole("region", { name: "Results and shortlist", hidden: true })).toBeTruthy();
    fireEvent.click(within(drawer).getByRole("button", { name: "Close" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(screen.getByTestId("url").textContent).toBe("/?Location=Leeds");
  });

  it("closes a profile reopened over the search to the search, where the tab has nothing of the site's to go back to", async () => {
    renderAt("/?Location=Leeds");
    fireEvent.click(await screen.findByRole("link", { name: "Jo Bloggs" }));
    await screen.findByRole("dialog", { name: "Jo Bloggs" });
    cleanup();
    // The tab went elsewhere with the drawer open, then came back by the profile's address.
    vi.stubGlobal("navigation", { canGoBack: false });
    renderAt("/therapist/Jo-ABCDEFGH");
    fireEvent.click(within(await screen.findByRole("dialog", { name: "Jo Bloggs" })).getByRole("button", { name: "Close" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(screen.getByTestId("url").textContent).toBe("/?Location=Leeds");
    expect(screen.getByRole("region", { name: "Results and shortlist" })).toBeTruthy();
  });

  it("shows another profile reached directly as a page of its own, though the tab opened one over a search", async () => {
    renderAt("/?Location=Leeds");
    fireEvent.click(await screen.findByRole("link", { name: "Jo Bloggs" }));
    await screen.findByRole("dialog", { name: "Jo Bloggs" });
    cleanup();
    vi.mocked(api.profile).mockResolvedValue({ ...PROFILE, slug: "Al-ABCDEFGH", name: "Al Smith" });
    renderAt("/therapist/Al-ABCDEFGH");
    expect(await screen.findByRole("heading", { name: "Al Smith" })).toBeTruthy();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("shows the accessibility statement as a page of its own, beneath the site's name", () => {
    renderAt("/accessibility");
    const header = screen.getByRole("banner");
    expect(within(header).getByRole("button", { name: "Find a UKCP therapist" })).toBeTruthy();
    expect(screen.getByRole("heading", { level: 1, name: "Accessibility statement" })).toBeTruthy();
    // Reached other than by a link, as by a reload, it leaves the keyboard at the top.
    expect(document.activeElement).toBe(document.body);
    expect(api.search).not.toHaveBeenCalled();
  });

  it("takes the keyboard to the statement's heading as the About card's link leads there from the search", async () => {
    renderAt("/");
    fireEvent.click(screen.getByRole("button", { name: "Find a UKCP therapist" }));
    fireEvent.click(within(screen.getByRole("dialog", { name: "About this site" })).getByRole("link", { name: "Accessibility statement" }));
    const heading = await screen.findByRole("heading", { level: 1, name: "Accessibility statement" });
    expect(screen.getByTestId("url").textContent).toBe("/accessibility");
    await waitFor(() => expect(document.activeElement).toBe(heading));
    // Past the card's close, which hands focus back to the title only when nothing else has taken it.
    await act(() => new Promise((done) => setTimeout(done, 50)));
    expect(document.activeElement).toBe(heading);
  });

  it("shortlists a therapist from the search, and opens them from the shortlist's tab over it", async () => {
    renderAt("/?Location=Leeds");
    fireEvent.click(await screen.findByRole("button", { name: "Add Jo Bloggs to your shortlist" }));
    fireEvent.mouseDown(screen.getByRole("tab", { name: "Shortlist, 1 therapist" }));
    fireEvent.click(within(screen.getByRole("tabpanel", { name: /^Shortlist/ })).getByRole("link", { name: "Jo Bloggs" }));
    const drawer = await screen.findByRole("dialog", { name: "Jo Bloggs" });
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
