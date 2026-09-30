// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes, type Location } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Profile } from "@shared/types";
import { api, ApiError } from "@/lib/api";
import { ProfilePage } from "./ProfilePage";

const PROFILE: Profile = { slug: "Test-ABCDEFGH", name: "Test Therapist", initials: "TT", languages: [], emailInContact: false, social: [], about: [], practical: [], offices: [] };

function renderAt(entries: (string | Partial<Location>)[], result: Profile | ApiError = PROFILE) {
  const profile = vi.spyOn(api, "profile");
  if (result instanceof ApiError) profile.mockRejectedValue(result);
  else profile.mockResolvedValue(result);
  // Current Chrome's scrollTo returns a promise.
  vi.spyOn(window, "scrollTo").mockImplementation(async () => {});
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter initialEntries={entries} initialIndex={entries.length - 1}>
        <Routes>
          <Route path="/" element={<p>Search page</p>} />
          <Route path="/therapist/:slug" element={<ProfilePage slug="Test-ABCDEFGH" />} />
        </Routes>
      </MemoryRouter>
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

  it("puts each office's fees above the profile's text", async () => {
    renderAt(["/therapist/Test-ABCDEFGH"], RICH);
    const fees = await screen.findByRole("heading", { name: "Fees" });
    expect(fees.compareDocumentPosition(screen.getByRole("heading", { name: "What I can help with" })) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    screen.getByText("£90 per session");
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
});
