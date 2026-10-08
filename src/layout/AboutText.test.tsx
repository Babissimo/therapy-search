// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { describe, expect, it } from "vitest";
import { AboutText } from "./AboutText";

describe("AboutText", () => {
  it("leads with what the site is in two short sentences, then where to turn for help today", () => {
    render(<AboutText />, { wrapper: MemoryRouter });
    const [lead, help] = screen.getAllByRole("paragraph");
    expect(lead?.textContent).toBe("This site helps you find a therapist in the UK. It shows therapists from UKCP's list, but UKCP does not run this site.");
    expect(help?.textContent).toMatch(/^Need help now\?/);
  });

  it("keeps the detail beneath: that it is unofficial, and how long it reuses answers", () => {
    render(<AboutText />, { wrapper: MemoryRouter });
    const how = screen.getByRole("heading", { name: "How it works" });
    const detail = how.nextElementSibling?.textContent ?? "";
    expect(detail).toContain("an unofficial, simpler way to search the UK Council for Psychotherapy's therapist directory");
    expect(detail).toContain("not affiliated with or endorsed by UKCP");
    expect(screen.getByText(/searches for 15 minutes \(online ones for 6 hours\), profiles for an hour/)).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Who sees what" })).toBeTruthy();
  });

  it("says the browser keeps those removed from the shortlist until it is cleared or the site is opened 30 days on", () => {
    render(<AboutText />, { wrapper: MemoryRouter });
    screen.getByText(/Anyone you remove from your shortlist is kept in case you add them back, until you clear it or open this site 30 days or more/);
    screen.getByText(/or open this site 30 days or more after removing them\.$/);
  });

  it("says the browser keeps the search each therapist was found by, with where the visitor stands, their notes and their drafts", () => {
    render(<AboutText />, { wrapper: MemoryRouter });
    screen.getByText(
      /with where you stand with each therapist, the search you found them by, your notes and email drafts, and the name and free times you give for drafts\)/,
    );
  });

  it("says the browser keeps the answers to the questions until the tab closes", () => {
    render(<AboutText />, { wrapper: MemoryRouter });
    screen.getByText(/until you close the tab, your answers to the questions and the search you last opened a profile or this text from, and shares none of them\./);
  });
});
