// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useRef } from "react";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { emptyParams, type SearchParams } from "@shared/query";
import type { SearchResult } from "@shared/types";
import { api, ApiError } from "@/lib/api";
import { LoadMore } from "./LoadMore";
import { Results } from "./Results";
import { withText } from "./state";
import { useResults } from "./useResults";

const TOO_MANY = "Too many searches in a short time. Wait a minute and try again.";

/** Thirty results, twelve a page, page n's cards n tenths of a mile away. `fail` names a page that fails. */
function answerPages({ total = 30, fail }: { total?: number; fail?: number } = {}) {
  return vi.spyOn(api, "search").mockImplementation(async (query): Promise<SearchResult> => {
    const q = new URLSearchParams(query);
    const page = Number(q.get("page") ?? 1);
    if (page === fail) throw new ApiError(429, TOO_MANY);
    const from = (page - 1) * 12 + 1;
    const to = Math.min(page * 12, total);
    const therapists = Array.from({ length: to - from + 1 }, (_, i) => ({
      slug: `p${page}-${i}`,
      name: `Therapist ${page}-${i}`,
      initials: "T",
      tags: [],
      distance: `${page / 10} miles from Leeds`,
    }));
    return { total, from, to, notices: [], therapists, locationSearched: q.get("Location") ?? undefined };
  });
}

function Harness({ params }: { params: SearchParams }) {
  const results = useResults(params);
  const listRef = useRef<HTMLUListElement>(null);
  return (
    <>
      <Results params={params} results={results} listRef={listRef} />
      <LoadMore results={results} listRef={listRef} />
    </>
  );
}

function renderResults(params: SearchParams) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const ui = (next: SearchParams) => (
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <Harness params={next} />
      </MemoryRouter>
    </QueryClientProvider>
  );
  const view = render(ui(params));
  return { rerender: (next: SearchParams) => view.rerender(ui(next)) };
}

const leeds = withText(emptyParams(), "Location", "Leeds");
const cards = () => screen.queryAllByRole("link", { name: /^Therapist/ });

afterEach(() => vi.restoreAllMocks());

describe("Results", () => {
  it("shows the nearest page, and adds the next with Load more", async () => {
    answerPages();
    renderResults(leeds);
    await screen.findByText("Nearest 12 of 30, up to 0.1 miles away");
    fireEvent.click(screen.getByRole("button", { name: "Load more" }));
    await screen.findByText("Nearest 24 of 30, up to 0.2 miles away");
    expect(cards()).toHaveLength(24);
  });

  it("keeps Load more in reach of the keyboard while the next page loads, and says it is loading", async () => {
    const search = answerPages();
    renderResults(leeds);
    const more = await screen.findByRole("button", { name: "Load more" });
    const answer = search.getMockImplementation();
    let release = () => {};
    search.mockImplementationOnce(async (query) => {
      await new Promise<void>((resolve) => (release = resolve));
      return answer!(query);
    });
    fireEvent.click(more);
    // The spinner shows the next page is on its way.
    await waitFor(() => expect(more.querySelector(".animate-spin")).not.toBeNull());
    expect((more as HTMLButtonElement).disabled).toBe(false);
    expect(more.getAttribute("aria-disabled")).toBe("true");
    act(() => more.focus());
    expect(document.activeElement).toBe(more);
    const status = screen.getByText("Loading more results");
    expect(status.getAttribute("aria-live")).toBe("polite");
    fireEvent.click(more);
    expect(search).toHaveBeenCalledTimes(2);
    await act(async () => release());
    await screen.findByText(/^Nearest 24 of 30/);
    expect(status.textContent).toBe("");
  });

  it("stops offering more once everything is loaded", async () => {
    answerPages();
    renderResults(leeds);
    fireEvent.click(await screen.findByRole("button", { name: "Load more" }));
    await screen.findByText(/^Nearest 24 of 30/);
    fireEvent.click(screen.getByRole("button", { name: "Load more" }));
    await screen.findByText(/^Nearest 30 of 30/);
    expect(screen.queryByRole("button", { name: "Load more" })).toBeNull();
  });

  it("carries keyboard focus from Load more to the first card of the last page", async () => {
    answerPages();
    renderResults(leeds);
    const more = await screen.findByRole("button", { name: "Load more" });
    act(() => more.focus());
    fireEvent.click(more);
    await screen.findByText(/^Nearest 24 of 30/);
    expect(document.activeElement).toBe(more);
    fireEvent.click(more);
    await screen.findByText(/^Nearest 30 of 30/);
    expect(document.activeElement).toBe(screen.getByRole("link", { name: "Therapist 3-0" }));
  });

  it("leaves focus alone when Load more didn't have it", async () => {
    answerPages();
    renderResults(leeds);
    fireEvent.click(await screen.findByRole("button", { name: "Load more" }));
    await screen.findByText(/^Nearest 24 of 30/);
    fireEvent.click(screen.getByRole("button", { name: "Load more" }));
    await screen.findByText(/^Nearest 30 of 30/);
    expect(document.activeElement).toBe(document.body);
  });

  it("leaves focus where the visitor moved it while the last page loaded", async () => {
    const search = answerPages({ total: 24 });
    renderResults(leeds);
    const more = await screen.findByRole("button", { name: "Load more" });
    const answer = search.getMockImplementation();
    let release = () => {};
    search.mockImplementationOnce(async (query) => {
      await new Promise<void>((resolve) => (release = resolve));
      return answer!(query);
    });
    act(() => more.focus());
    fireEvent.click(more);
    const elsewhere = screen.getByRole("link", { name: "Therapist 1-0" });
    act(() => elsewhere.focus());
    await act(async () => release());
    await screen.findByText(/^Nearest 24 of 24/);
    expect(document.activeElement).toBe(elsewhere);
  });

  it("counts plainly when the search has no location", async () => {
    answerPages();
    renderResults(emptyParams());
    expect(await screen.findByText("12 of 30")).toBeTruthy();
  });

  it("keeps what loaded when the next page fails, and tries again", async () => {
    const search = answerPages({ fail: 2 });
    renderResults(leeds);
    fireEvent.click(await screen.findByRole("button", { name: "Load more" }));
    expect((await screen.findByRole("alert")).textContent).toContain(TOO_MANY);
    expect(cards()).toHaveLength(12);
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    await waitFor(() => expect(search.mock.calls.filter(([query]) => query.includes("page=2"))).toHaveLength(2));
  });

  it("carries keyboard focus from Load more to Try again when the next page fails", async () => {
    answerPages({ fail: 2 });
    renderResults(leeds);
    const more = await screen.findByRole("button", { name: "Load more" });
    act(() => more.focus());
    fireEvent.click(more);
    const retry = await screen.findByRole("button", { name: "Try again" });
    expect(document.activeElement).toBe(retry);
  });

  it("keeps keyboard focus on the same button through a failed page and its retry", async () => {
    const search = answerPages();
    renderResults(leeds);
    const more = await screen.findByRole("button", { name: "Load more" });
    search.mockRejectedValueOnce(new ApiError(429, TOO_MANY));
    act(() => more.focus());
    fireEvent.click(more);
    expect(await screen.findByRole("button", { name: "Try again" })).toBe(more);
    fireEvent.click(more);
    await screen.findByText(/^Nearest 24 of 30/);
    expect(screen.getByRole("button", { name: "Load more" })).toBe(more);
    expect(document.activeElement).toBe(more);
  });

  it("carries keyboard focus to the first new card when a retried last page arrives", async () => {
    const search = answerPages({ total: 24 });
    renderResults(leeds);
    const more = await screen.findByRole("button", { name: "Load more" });
    search.mockRejectedValueOnce(new ApiError(429, TOO_MANY));
    act(() => more.focus());
    fireEvent.click(more);
    fireEvent.click(await screen.findByRole("button", { name: "Try again" }));
    await screen.findByText(/^Nearest 24 of 24/);
    expect(document.activeElement).toBe(screen.getByRole("link", { name: "Therapist 2-0" }));
  });

  it("offers UKCP's own search when the first page fails", async () => {
    answerPages({ fail: 1 });
    renderResults(leeds);
    expect((await screen.findByRole("link", { name: "Search on UKCP" })).getAttribute("href")).toContain("Location=Leeds");
  });

  it("starts again from the nearest page when the search changes", async () => {
    answerPages();
    const { rerender } = renderResults(leeds);
    fireEvent.click(await screen.findByRole("button", { name: "Load more" }));
    await screen.findByText(/^Nearest 24 of 30/);
    rerender(withText(emptyParams(), "Location", "York"));
    await screen.findByText(/^Nearest 12 of 30/);
    expect(cards()).toHaveLength(12);
  });
});
