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
});
