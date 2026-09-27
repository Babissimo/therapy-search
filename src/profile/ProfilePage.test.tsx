// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { api, ApiError } from "@/lib/api";
import { ProfilePage } from "./ProfilePage";

function renderAt(entries: string[]) {
  vi.spyOn(api, "profile").mockRejectedValue(new ApiError(404, "This profile isn't on UKCP any more."));
  // Current Chrome's scrollTo returns a promise.
  vi.spyOn(window, "scrollTo").mockImplementation(async () => {});
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter initialEntries={entries} initialIndex={entries.length - 1}>
        <Routes>
          <Route path="/" element={<p>Search page</p>} />
          <Route path="/therapist/:slug" element={<ProfilePage slug="Gone-ABCDEFGH" />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

afterEach(() => vi.restoreAllMocks());

describe("ProfilePage when the profile can't be shown", () => {
  it("says why and goes back to the visitor's search", async () => {
    renderAt(["/?Location=Leeds", "/therapist/Gone-ABCDEFGH"]);
    await screen.findByText(/isn't on UKCP any more/);
    fireEvent.click(screen.getByRole("button", { name: "Go back" }));
    await screen.findByText("Search page");
  });

  it("offers a new search to a visitor who arrived on the profile directly", async () => {
    renderAt(["/therapist/Gone-ABCDEFGH"]);
    expect((await screen.findByRole("link", { name: "Search for a therapist" })).getAttribute("href")).toBe("/");
  });
});
