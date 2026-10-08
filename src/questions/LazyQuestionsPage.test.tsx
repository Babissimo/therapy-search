// @vitest-environment jsdom
import { act, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SITE_NAME } from "@/lib/useTitle";
import type { QuestionsPage } from "./QuestionsPage";

type Module = { QuestionsPage: typeof QuestionsPage };

/** The questions' chunk, standing in for the real one. */
const STAND_IN: Module = { QuestionsPage: () => <h1>Is it urgent?</h1> };

/** The lazy page's module read afresh, so it meets whatever `vi.doMock` has put in place of the page. */
async function fresh() {
  vi.resetModules();
  return import("./LazyQuestionsPage");
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.doUnmock("./QuestionsPage");
  vi.resetModules();
});

describe("LazyQuestionsPage", () => {
  it("says the questions are loading while their chunk is on the way, then draws them in place of that", async () => {
    let arrive: (module: Module) => void = () => {};
    const arrived = new Promise<Module>((resolve) => (arrive = resolve));
    vi.doMock("./QuestionsPage", () => arrived);
    const { LazyQuestionsPage } = await fresh();
    render(<LazyQuestionsPage />, { wrapper: MemoryRouter });
    expect(screen.getByRole("status").textContent).toBe("Loading the questions");
    expect(document.title).toBe(`A few questions - ${SITE_NAME}`);
    await act(async () => arrive(STAND_IN));
    await screen.findByRole("heading", { name: "Is it urgent?" });
    expect(screen.queryByRole("status")).toBeNull();
    expect(document.title).toBe(SITE_NAME);
  });

  it("announces that the questions couldn't be shown when their chunk can't be fetched, with a way on to the search", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.doMock("./QuestionsPage", () => Promise.reject(new TypeError("Failed to fetch dynamically imported module")));
    const { LazyQuestionsPage } = await fresh();
    render(<LazyQuestionsPage />, { wrapper: MemoryRouter });
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toBe("The questions couldn't be shown just now. Reload the page to try again, or search for a therapist.");
    expect(within(alert).getByRole("link", { name: "search for a therapist" }).getAttribute("href")).toBe("/");
    expect(screen.queryByRole("status")).toBeNull();
    expect(document.title).toBe(`The questions couldn't be shown - ${SITE_NAME}`);
  });
});
