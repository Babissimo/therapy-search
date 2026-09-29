// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Profile } from "@shared/types";
import { api, ApiError } from "@/lib/api";
import { ProfilePage } from "./ProfilePage";

const PROFILE: Profile = { slug: "Test-ABCDEFGH", name: "Test Therapist", initials: "TT", languages: [], social: [], about: [], practical: [], offices: [] };

function renderAt(entries: string[], result: Profile | ApiError = PROFILE) {
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
