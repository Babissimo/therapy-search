// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { describe, expect, it } from "vitest";
import type { TherapistCard as Therapist } from "@shared/types";
import { TherapistCard } from "./TherapistCard";

const therapist = (extra: Partial<Therapist> = {}): Therapist => ({
  slug: "Test-Therapist-1-TESTID01",
  name: "Test Therapist 1",
  initials: "TT",
  location: "London E8",
  distance: "0.2 miles from E8 3DQ",
  sessionTypes: "In-person & Remote",
  summary: "Summary text.",
  tags: ["Anxiety", "Trauma", "EMDR"],
  ...extra,
});

function renderCard(t: Therapist, sought: string[] = [], { grouped }: { grouped?: boolean } = {}) {
  render(
    <MemoryRouter>
      <TherapistCard therapist={t} sought={new Set(sought)} grouped={grouped} />
    </MemoryRouter>,
  );
}

describe("TherapistCard", () => {
  it("links to the profile and says where the therapist is from the searched place", () => {
    renderCard(therapist());
    expect(screen.getByRole("link", { name: "Test Therapist 1" }).getAttribute("href")).toBe("/therapist/Test-Therapist-1-TESTID01");
    screen.getByText("E8 (0.2 miles away)");
    screen.getByText("In-person & Remote");
    screen.getByText("Summary text.");
  });

  it("keeps a full postcode without its town", () => {
    renderCard(therapist({ location: "Hackney E8 3DQ", distance: "1 mile from E8 3DQ" }));
    screen.getByText("E8 3DQ (1 mile away)");
  });

  it("keeps a location with no postcode in it", () => {
    renderCard(therapist({ location: "St Albans", distance: "18 miles from E8 3DQ" }));
    screen.getByText("St Albans (18 miles away)");
  });

  it("keeps a distance whose wording it does not know", () => {
    renderCard(therapist({ distance: "under a mile from E8 3DQ" }));
    screen.getByText("E8 (under a mile away)");
  });

  it("leaves the place to the heading of its pin's box, keeping the distance", () => {
    renderCard(therapist(), [], { grouped: true });
    expect(screen.getByRole("heading", { level: 3 }).textContent).toBe("Test Therapist 1");
    screen.getByText("0.2 miles away");
    expect(screen.queryByText(/E8 \(/)).toBeNull();
  });

  it("keeps the town when there is no searched place to measure from", () => {
    renderCard(therapist({ distance: undefined }));
    screen.getByText("London E8");
  });

  it("shows only the tags the search asked for", () => {
    renderCard(therapist(), ["trauma", "emdr", "french"]);
    expect(screen.getAllByRole("listitem").map((li) => li.textContent)).toEqual(["Trauma", "EMDR"]);
  });

  it("shows no tags for a search that asks for none", () => {
    renderCard(therapist());
    expect(screen.queryByRole("list")).toBeNull();
  });
});
